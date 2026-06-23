// Requirement evaluation engine
import { prisma } from './db';
import type { RequirementStatus, Plan } from './types';

export async function evaluatePlan(planId: string): Promise<RequirementStatus[]> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      primaryMajor: {
        include: {
          requirementGroups: true,
        },
      },
      secondaryMajor: {
        include: {
          requirementGroups: true,
        },
      },
      plannedCourses: {
        include: {
          course: true,
        },
      },
    },
  });

  if (!plan) {
    throw new Error(`Plan ${planId} not found`);
  }

  const statuses: RequirementStatus[] = [];
  const completedCourseIds = plan.plannedCourses
    .filter(pc => pc.isCompleted)
    .map(pc => pc.courseId);
  const plannedCourseIds = plan.plannedCourses.map(pc => pc.courseId);
  
  // Parse AP credits from plan (map: AP course name -> array of Dartmouth course IDs)
  let apCreditsMap: Record<string, string[]> = {};
  try {
    const parsed = typeof (plan as any).apCredits === 'string' 
      ? JSON.parse((plan as any).apCredits) 
      : ((plan as any).apCredits || {});
    
    // Handle backward compatibility
    if (Array.isArray(parsed)) {
      parsed.forEach((courseId: string) => {
        apCreditsMap[courseId] = [courseId];
      });
    } else if (typeof parsed === 'object' && parsed !== null) {
      for (const [apCourse, dartmouthCourses] of Object.entries(parsed)) {
        if (Array.isArray(dartmouthCourses)) {
          apCreditsMap[apCourse] = dartmouthCourses;
        } else {
          apCreditsMap[apCourse] = [dartmouthCourses as string];
        }
      }
    }
  } catch {
    apCreditsMap = {};
  }
  
  // Get set of all Dartmouth course IDs that are satisfied by AP credits
  const apCreditIds = new Set<string>();
  for (const courses of Object.values(apCreditsMap)) {
    courses.forEach(courseId => apCreditIds.add(courseId));
  }
  
  // Include AP credits in allCourseIds so they count towards major requirements
  const allCourseIds = [...new Set([...completedCourseIds, ...plannedCourseIds, ...apCreditIds])];

  // Evaluate major requirements
  // Track courses that have been used - each course can only satisfy one requirement group
  // Strategy: Prioritize applying courses to groups that aren't satisfied yet
  const usedCourseIds = new Set<string>();
  
  if (plan.primaryMajor) {
    // First pass: Check which groups are already satisfied (without tracking "used" courses)
    // This allows us to identify groups that don't need courses
    const groupSatisfactionStatus = new Map<string, { isSatisfied: boolean; satisfiedCount: number; coursesApplied: string[] }>();
    
    for (const group of plan.primaryMajor.requirementGroups) {
      const requiredIds = JSON.parse(group.requiredCourseIds || '[]') as string[];
      const allowedIds = JSON.parse(group.allowedCourseIds || '[]') as string[];
      const minCourses = group.minCourses || 0;

      let satisfiedCount = 0;
      const coursesApplied: string[] = [];

      // Check required courses first (they take priority)
      for (const courseId of requiredIds) {
        if (allCourseIds.includes(courseId)) {
          satisfiedCount++;
          coursesApplied.push(courseId);
        }
      }

      // Check allowed courses (electives)
      for (const courseId of allowedIds) {
        if (allCourseIds.includes(courseId)) {
          satisfiedCount++;
          coursesApplied.push(courseId);
        }
      }

      // A group is satisfied if we have enough courses AND all required courses are present
      const isSatisfied = satisfiedCount >= minCourses && requiredIds.every(id => coursesApplied.includes(id));
      
      groupSatisfactionStatus.set(group.id, { isSatisfied, satisfiedCount, coursesApplied });
    }
    
    // Second pass: Process groups with priority logic
    // Strategy: 
    // 1. Process satisfied groups first and lock in their minimum required courses (marking as used)
    // 2. Then, process unsatisfied groups in ID order (ascending)
    // 3. For unsatisfied groups: only assign courses if no higher priority unsatisfied group needs them
    //    This ensures higher priority groups get courses before lower priority groups
    
    // Sort groups: by ID (ascending), with "electives" group always having lowest priority (processed last)
    const sortedGroups = [...plan.primaryMajor.requirementGroups].sort((a, b) => {
      // Check if groups are "electives" (case-insensitive)
      const aIsElectives = a.name.toLowerCase().includes('elective');
      const bIsElectives = b.name.toLowerCase().includes('elective');
      
      // "electives" groups go last
      if (aIsElectives !== bIsElectives) {
        return aIsElectives ? 1 : -1; // electives go to the end
      }
      
      // If both are electives or both are not electives, sort by ID in ascending order
      return a.id.localeCompare(b.id);
    });
    
    // Store results in a map keyed by group ID to preserve original order for display
    const groupResults = new Map<string, { isSatisfied: boolean; progress: number; coursesApplied: string[] }>();
    
    // Track which unsatisfied groups have been processed and their course needs
    const unsatisfiedGroupNeeds = new Map<string, { requiredIds: string[]; allowedIds: string[]; minCourses: number }>();
    
    // First, collect all unsatisfied groups and their needs
    for (const group of sortedGroups) {
      const groupStatus = groupSatisfactionStatus.get(group.id);
      if (groupStatus && !groupStatus.isSatisfied) {
        const requiredIds = JSON.parse(group.requiredCourseIds || '[]') as string[];
        const allowedIds = JSON.parse(group.allowedCourseIds || '[]') as string[];
        const minCourses = group.minCourses || 0;
        unsatisfiedGroupNeeds.set(group.id, { requiredIds, allowedIds, minCourses });
      }
    }
    
    // Process all groups in sorted order (satisfied first, then by ID ascending) to assign courses
    for (const group of sortedGroups) {
      const requiredIds = JSON.parse(group.requiredCourseIds || '[]') as string[];
      const allowedIds = JSON.parse(group.allowedCourseIds || '[]') as string[];
      const minCourses = group.minCourses || 0;
      
      const groupStatus = groupSatisfactionStatus.get(group.id);
      if (!groupStatus) continue;
      
      const { isSatisfied: groupAlreadySatisfied } = groupStatus;
      
      let satisfiedCount = 0;
      const coursesApplied: string[] = [];

      if (groupAlreadySatisfied) {
        // For satisfied groups, only lock in the minimum required courses
        // Extra courses beyond the minimum should be available for unsatisfied groups
        
        // First, lock in all required courses (they're mandatory)
        for (const courseId of requiredIds) {
          if (groupStatus.coursesApplied.includes(courseId) && !usedCourseIds.has(courseId)) {
            usedCourseIds.add(courseId);
            satisfiedCount++;
            coursesApplied.push(courseId);
          }
        }
        
        // Then, lock in only enough additional courses (from allowed courses) to meet the minimum requirement
        // If we already have enough from required courses, don't lock in any extra
        const stillNeeded = Math.max(0, minCourses - satisfiedCount);
        let lockedExtra = 0;
        
        // Process allowed courses that are in the group's coursesApplied
        for (const courseId of allowedIds) {
          if (lockedExtra >= stillNeeded) break; // We've locked in enough
          if (groupStatus.coursesApplied.includes(courseId) && !usedCourseIds.has(courseId)) {
            // This is an allowed course that satisfies this group and hasn't been used yet
            usedCourseIds.add(courseId);
            satisfiedCount++;
            coursesApplied.push(courseId);
            lockedExtra++;
          }
        }
        
        // Any remaining courses in groupStatus.coursesApplied that weren't locked in
        // are available for unsatisfied groups (they won't be in coursesApplied for this group)
      } else {
        // Check if this is an electives group
        const isElectivesGroup = group.name.toLowerCase().includes('elective');
        
        // For unsatisfied groups, only use courses that:
        // 1. Haven't been locked in by satisfied groups
        // 2. Are not needed by a higher priority unsatisfied group
        //
        // SPECIAL RULE FOR ELECTIVES: Don't assign courses to electives until every other group
        // where that course is part of the optional or required courses is satisfied.
        //
        // STRICT PRIORITY RULE: Higher priority groups (lower ID) get courses first, even if
        // assigning the course to a lower priority group would satisfy that group.
        // Example: If Group A (ID 1) needs COSC-1 and Group B (ID 2) also needs COSC-1,
        // Group A gets it even if COSC-1 would satisfy Group B.
        
        // Helper function to check if a course is needed by a higher priority unsatisfied group
        // that hasn't been satisfied yet. Since we process groups in ID order, higher priority
        // groups are processed first, so we check their results to see if they still need the course.
        const isNeededByHigherPriorityGroup = (courseId: string): boolean => {
          for (const [otherGroupId, otherGroupNeeds] of unsatisfiedGroupNeeds.entries()) {
            // Skip self
            if (otherGroupId === group.id) continue;
            
            // Check if this group has higher priority (lower ID)
            // Since we process in order, if otherGroupId < group.id, it has already been processed
            if (otherGroupId.localeCompare(group.id) < 0) {
              // Check if the higher priority group needs this course (in required or allowed list)
              if (otherGroupNeeds.requiredIds.includes(courseId) || otherGroupNeeds.allowedIds.includes(courseId)) {
                // Check the result of the higher priority group
                const otherGroupResult = groupResults.get(otherGroupId);
                
                // If higher priority group is satisfied, the course is available for lower priority groups
                if (otherGroupResult && otherGroupResult.isSatisfied) {
                  continue;
                }
                
                // If higher priority group already has this course, it's not available
                // (This check is mostly redundant since usedCourseIds would contain it, but it's explicit)
                if (otherGroupResult && otherGroupResult.coursesApplied.includes(courseId)) {
                  continue;
                }
                
                // Higher priority group needs this course but doesn't have it yet
                // This could happen if:
                // 1. The course wasn't available when we processed the higher priority group (locked by satisfied group)
                // 2. The course became available later (from a satisfied group's extra courses)
                // STRICT PRIORITY: Reserve it for the higher priority group, even if assigning it to
                // the lower priority group would satisfy the lower priority group
                console.log(`[Priority] Course ${courseId} reserved for higher priority group ${otherGroupId} (current group: ${group.id})`);
                return true;
              }
            }
          }
          return false;
        };
        
        // Helper function to check if a course is needed by any other non-electives group
        // that isn't satisfied yet. Used specifically for electives groups.
        // We need to check ALL groups (not just unsatisfied ones) to see if they need the course.
        const isNeededByOtherNonElectivesGroup = (courseId: string): boolean => {
          if (!plan.primaryMajor) return false;
          
          // Check all groups in the plan, not just unsatisfied ones
          for (const otherGroup of plan.primaryMajor.requirementGroups) {
            // Skip self
            if (otherGroup.id === group.id) continue;
            
            // Skip other electives groups - we only care about non-electives groups
            const otherIsElectives = otherGroup.name.toLowerCase().includes('elective');
            if (otherIsElectives) continue;
            
            // Get the required and allowed courses for this group
            const otherRequiredIds = JSON.parse(otherGroup.requiredCourseIds || '[]') as string[];
            const otherAllowedIds = JSON.parse(otherGroup.allowedCourseIds || '[]') as string[];
            
            // Check if this group needs the course (in required or allowed list)
            if (otherRequiredIds.includes(courseId) || otherAllowedIds.includes(courseId)) {
              // Check if the other group is satisfied
              const otherGroupResult = groupResults.get(otherGroup.id);
              if (otherGroupResult && otherGroupResult.isSatisfied) {
                // Other group is satisfied, so this course is available
                continue;
              }
              
              // Check the initial satisfaction status
              const otherGroupStatus = groupSatisfactionStatus.get(otherGroup.id);
              if (otherGroupStatus && otherGroupStatus.isSatisfied) {
                // Other group was satisfied from the start, so this course is available
                continue;
              }
              
              // Other non-electives group needs this course and isn't satisfied yet
              console.log(`[Electives] Course ${courseId} reserved for non-electives group ${otherGroup.id} (${otherGroup.name}) - current group: ${group.id}`);
              return true;
            }
          }
          return false;
        };
        
        // Check required courses first (they take priority)
        for (const courseId of requiredIds) {
          if (allCourseIds.includes(courseId) && !usedCourseIds.has(courseId)) {
            // For electives groups: check if any other non-electives group needs it
            // For non-electives groups: check if higher priority group needs it
            const shouldSkip = isElectivesGroup 
              ? isNeededByOtherNonElectivesGroup(courseId)
              : isNeededByHigherPriorityGroup(courseId);
            
            if (!shouldSkip) {
              satisfiedCount++;
              coursesApplied.push(courseId);
              usedCourseIds.add(courseId); // Mark as used
              console.log(`[Priority] Group ${group.id} assigned ${courseId}${isElectivesGroup ? ' (no other non-electives group needs it)' : ' (no higher priority group needs it)'}`);
            } else {
              console.log(`[Priority] Group ${group.id} skipped ${courseId}${isElectivesGroup ? ' (reserved for other non-electives group)' : ' (reserved for higher priority group)'}`);
            }
          }
        }

        // Check allowed courses (electives) - only if not already used
        for (const courseId of allowedIds) {
          if (allCourseIds.includes(courseId) && !usedCourseIds.has(courseId)) {
            // For electives groups: check if any other non-electives group needs it
            // For non-electives groups: check if higher priority group needs it
            const shouldSkip = isElectivesGroup 
              ? isNeededByOtherNonElectivesGroup(courseId)
              : isNeededByHigherPriorityGroup(courseId);
            
            if (!shouldSkip) {
              satisfiedCount++;
              coursesApplied.push(courseId);
              usedCourseIds.add(courseId); // Mark as used
              console.log(`[Priority] Group ${group.id} assigned ${courseId}${isElectivesGroup ? ' (no other non-electives group needs it)' : ' (no higher priority group needs it)'}`);
            } else {
              console.log(`[Priority] Group ${group.id} skipped ${courseId}${isElectivesGroup ? ' (reserved for other non-electives group)' : ' (reserved for higher priority group)'}`);
            }
          }
        }
      }

      const progress = minCourses > 0 ? Math.min(satisfiedCount / minCourses, 1) : (requiredIds.length > 0 ? satisfiedCount / requiredIds.length : 1);
      // Recalculate isSatisfied based on actual courses applied (considering usedCourseIds)
      const isSatisfied = satisfiedCount >= minCourses && requiredIds.every(id => coursesApplied.includes(id));

      // Store result in map for later retrieval in original order
      groupResults.set(group.id, { isSatisfied, progress, coursesApplied });
    }
    
    // Now build statuses array sorted by ID (for display)
    const groupsForDisplay = [...plan.primaryMajor.requirementGroups].sort((a, b) => {
      return a.id.localeCompare(b.id);
    });
    
    for (const group of groupsForDisplay) {
      const result = groupResults.get(group.id);
      if (!result) continue;
      
      statuses.push({
        id: `major-${plan.primaryMajor.id}-${group.id}`,
        label: `${plan.primaryMajor.name}: ${group.name}`,
        type: "major",
        isSatisfied: result.isSatisfied,
        progress: result.progress,
        coursesApplied: result.coursesApplied,
      });
    }
  }

  // Evaluate distributive requirements (need 2 courses for each)
  const distributives = ["TAS", "QDS", "ART", "LIT", "SOC", "INT", "SCI"];
  for (const dist of distributives) {
    const coursesWithDist = plan.plannedCourses.filter(pc => {
      const dists = JSON.parse(pc.course.distributives || '[]') as string[];
      return dists.includes(dist);
    });

    const requiredCount = 2;
    const isSatisfied = coursesWithDist.length >= requiredCount;
    statuses.push({
      id: `distributive-${dist}`,
      label: `Distributive: ${dist}`,
      type: "distributive",
      isSatisfied,
      progress: Math.min(coursesWithDist.length / requiredCount, 1),
      coursesApplied: coursesWithDist.map(pc => pc.courseId),
    });
  }

  // Evaluate world culture requirements
  const worldCultures = ["W", "NW", "CI"];
  for (const wc of worldCultures) {
    const coursesWithWC = plan.plannedCourses.filter(pc => pc.course.worldCulture === wc);
    const isSatisfied = coursesWithWC.length >= 1;
    statuses.push({
      id: `worldCulture-${wc}`,
      label: `World Culture: ${wc}`,
      type: "worldCulture",
      isSatisfied,
      progress: isSatisfied ? 1 : coursesWithWC.length,
      coursesApplied: coursesWithWC.map(pc => pc.courseId),
    });
  }

  // Evaluate language requirement (3rd level course in any language)
  // Common language departments at Dartmouth
  const languageDepartments = ["FREN", "SPAN", "GERM", "ITAL", "LATN", "GREC", "ARAB", "CHIN", "JAPN", "RUSS", "HEBR", "PORT", "KORE"];
  const languageCourses = plan.plannedCourses.filter(pc => {
    const isLanguageDept = languageDepartments.includes(pc.course.department);
    // Check if course number is exactly "3" or starts with "3." (e.g., "3", "3.0", "3.1")
    // This excludes courses like "30", "31", etc.
    const courseNumber = pc.course.number.trim();
    const isThirdLevel = courseNumber === "3" || courseNumber.startsWith("3.");
    return isLanguageDept && isThirdLevel;
  });
  
  const isLanguageSatisfied = languageCourses.length >= 1;
  statuses.push({
    id: 'language',
    label: 'Big Green Path',
    type: "language",
    isSatisfied: isLanguageSatisfied,
    progress: isLanguageSatisfied ? 1 : 0,
    coursesApplied: languageCourses.map(pc => pc.courseId),
  });

  // Evaluate minor requirements
  // Parse minors from plan (stored as JSON array of strings)
  let minors: string[] = [];
  try {
    const minorsData = plan.minors;
    if (minorsData) {
      const parsed = typeof minorsData === 'string' ? JSON.parse(minorsData) : minorsData;
      if (Array.isArray(parsed)) {
        minors = parsed;
      }
    }
  } catch {
    minors = [];
  }

  // For each minor, check if there's a Major with the same name to evaluate requirements
  // Otherwise, just mark as selected (no requirements to evaluate)
  for (const minorName of minors) {
    // Try to find a Major with matching name or department
    const minorMajor = await prisma.major.findFirst({
      where: {
        OR: [
          { name: { contains: minorName, mode: 'insensitive' } },
          { department: { contains: minorName, mode: 'insensitive' } },
        ],
      },
      include: {
        requirementGroups: true,
      },
    });

    if (minorMajor && minorMajor.requirementGroups.length > 0) {
      // Evaluate minor requirements similar to major requirements
      // Use a separate usedCourseIds set for minors to avoid double-counting
      const minorUsedCourseIds = new Set<string>();
      
      // Sort groups by ID (ascending), with electives last
      const sortedMinorGroups = [...minorMajor.requirementGroups].sort((a, b) => {
        const aIsElectives = a.name.toLowerCase().includes('elective');
        const bIsElectives = b.name.toLowerCase().includes('elective');
        if (aIsElectives !== bIsElectives) {
          return aIsElectives ? 1 : -1;
        }
        return a.id.localeCompare(b.id);
      });

      for (const group of sortedMinorGroups) {
        const requiredIds = JSON.parse(group.requiredCourseIds || '[]') as string[];
        const allowedIds = JSON.parse(group.allowedCourseIds || '[]') as string[];
        const minCourses = group.minCourses || 0;

        let satisfiedCount = 0;
        const coursesApplied: string[] = [];

        // Check required courses
        for (const courseId of requiredIds) {
          if (allCourseIds.includes(courseId) && !minorUsedCourseIds.has(courseId)) {
            satisfiedCount++;
            coursesApplied.push(courseId);
            minorUsedCourseIds.add(courseId);
          }
        }

        // Check allowed courses
        for (const courseId of allowedIds) {
          if (allCourseIds.includes(courseId) && !minorUsedCourseIds.has(courseId)) {
            satisfiedCount++;
            coursesApplied.push(courseId);
            minorUsedCourseIds.add(courseId);
          }
        }

        const progress = minCourses > 0 ? Math.min(satisfiedCount / minCourses, 1) : (requiredIds.length > 0 ? satisfiedCount / requiredIds.length : 1);
        const isSatisfied = satisfiedCount >= minCourses && requiredIds.every(id => coursesApplied.includes(id));

        statuses.push({
          id: `minor-${minorName}-${group.id}`,
          label: `${minorName}: ${group.name}`,
          type: "minor",
          isSatisfied,
          progress,
          coursesApplied,
        });
      }
    } else {
      // No major found for this minor, or no requirement groups
      // Just show the minor as selected (no requirements to track)
      statuses.push({
        id: `minor-${minorName}`,
        label: minorName,
        type: "minor",
        isSatisfied: true, // Minor is selected
        progress: 1,
        coursesApplied: [],
      });
    }
  }

  return statuses;
}

