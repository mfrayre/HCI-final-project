// Violations detection engine
import { prisma } from './db';
import type { Violation } from './types';

// Term order: Spring (S), Summer (X), Fall (F), Winter (W)
const TERM_SEASON_ORDER: Record<string, number> = { 'S': 0, 'X': 1, 'F': 2, 'W': 3 };

// Current term - update this when the current term changes
const CURRENT_TERM = '26W';

/**
 * Compare two term codes chronologically
 * Format: YYT where YY is year and T is season (S, X, F, W)
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
function compareTermCodes(a: string, b: string): number {
  // Extract year and season from term code (e.g., "25S" -> year: "25", season: "S")
  const yearA = parseInt(a.slice(0, -1));
  const yearB = parseInt(b.slice(0, -1));
  const seasonA = a.slice(-1);
  const seasonB = b.slice(-1);
  
  if (yearA !== yearB) {
    return yearA - yearB;
  }
  
  // Same year, compare by season order
  const orderA = TERM_SEASON_ORDER[seasonA] ?? 999;
  const orderB = TERM_SEASON_ORDER[seasonB] ?? 999;
  return orderA - orderB;
}

/**
 * Determine if a term is before the current term
 * Terms before the current term should be marked as completed
 * @param termCode - The term code to check (e.g., "25S", "26W")
 * @returns true if the term is before the current term, false otherwise
 */
export function isTermBeforeCurrent(termCode: string): boolean {
  return compareTermCodes(termCode, CURRENT_TERM) < 0;
}

/**
 * Determine if a course in a given term should be marked as completed
 * Courses in terms before the current term are completed
 * Courses in the current term or later are in progress
 * @param termCode - The term code for the course
 * @returns true if the course should be marked as completed
 */
export function shouldMarkCourseCompleted(termCode: string): boolean {
  return isTermBeforeCurrent(termCode);
}

export async function evaluateViolations(planId: string): Promise<Violation[]> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      termPlans: {
        include: {
          plannedCourses: {
            include: {
              course: true,
            },
          },
        },
      },
    },
  });

  if (!plan) {
    throw new Error(`Plan ${planId} not found`);
  }

  const violations: Violation[] = [];
  const completedCourseIds = new Set<string>();
  
  // Parse AP credits from plan (map: AP course name -> array of Dartmouth course IDs)
  let apCreditsMap: Record<string, string[]> = {};
  try {
    const parsed = typeof (plan as any).apCredits === 'string' 
      ? JSON.parse((plan as any).apCredits) 
      : ((plan as any).apCredits || {});
    
    // Handle backward compatibility
    if (Array.isArray(parsed)) {
      // Old format: array of course IDs
      parsed.forEach((courseId: string) => {
        apCreditsMap[courseId] = [courseId];
      });
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Convert to new format: Record<string, string[]>
      for (const [apCourse, dartmouthCourses] of Object.entries(parsed)) {
        if (Array.isArray(dartmouthCourses)) {
          apCreditsMap[apCourse] = dartmouthCourses;
        } else {
          // Old format: single string, convert to array
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
  
  // Sort term plans chronologically (S, X, F, W order)
  const sortedTermPlans = [...plan.termPlans].sort((a, b) => compareTermCodes(a.termCode, b.termCode));
  const termOrder = sortedTermPlans.map(tp => tp.termCode);

  // Track completed courses chronologically
  for (const termPlan of sortedTermPlans) {
    for (const plannedCourse of termPlan.plannedCourses) {
      if (plannedCourse.isCompleted) {
        completedCourseIds.add(plannedCourse.courseId);
      }
    }
  }

  // Check each term plan
  for (const termPlan of sortedTermPlans) {
    const termIndex = termOrder.indexOf(termPlan.termCode);
    const previousTerms = termOrder.slice(0, termIndex);

    // Check overload
    if (termPlan.plannedCourses.length > termPlan.maxCourses) {
      violations.push({
        id: `overload-${termPlan.id}`,
        type: "overload",
        message: `Term ${termPlan.termCode} exceeds maximum of ${termPlan.maxCourses} courses (${termPlan.plannedCourses.length} planned)`,
        termCode: termPlan.termCode,
        severity: "error",
      });
    }

    // Check each course in this term
    for (const plannedCourse of termPlan.plannedCourses) {
      const course = plannedCourse.course;
      const prereqs = JSON.parse(course.prerequisites || '[]') as (string | string[])[];
      const offeredTerms = JSON.parse(course.offeredTerms || '[]') as string[];

      // Check prerequisites with support for OR groups
      for (const prereq of prereqs) {
        let prereqSatisfied = false;
        let missingPrereqIds: string[] = [];
        
        if (typeof prereq === 'string') {
          // Single prerequisite (AND logic)
          const prereqCompleted = completedCourseIds.has(prereq);
          const prereqInEarlierTerm = sortedTermPlans
            .filter(tp => previousTerms.includes(tp.termCode))
            .some(tp => tp.plannedCourses.some(pc => pc.courseId === prereq));
          const prereqSatisfiedByAP = apCreditIds.has(prereq);
          
          prereqSatisfied = prereqCompleted || prereqInEarlierTerm || prereqSatisfiedByAP;
          if (!prereqSatisfied) {
            missingPrereqIds = [prereq];
          }
        } else if (Array.isArray(prereq)) {
          // OR group - any one of these courses satisfies the requirement
          const satisfiedCourse = prereq.find(prereqId => {
            const prereqCompleted = completedCourseIds.has(prereqId);
            const prereqInEarlierTerm = sortedTermPlans
              .filter(tp => previousTerms.includes(tp.termCode))
              .some(tp => tp.plannedCourses.some(pc => pc.courseId === prereqId));
            const prereqSatisfiedByAP = apCreditIds.has(prereqId);
            return prereqCompleted || prereqInEarlierTerm || prereqSatisfiedByAP;
          });
          
          prereqSatisfied = satisfiedCourse !== undefined;
          if (!prereqSatisfied) {
            missingPrereqIds = prereq;
          }
        }
        
        if (!prereqSatisfied) {
          const prereqDisplay = Array.isArray(prereq) 
            ? `(${prereq.join(' OR ')})` 
            : prereq;
          violations.push({
            id: `prereq-${plannedCourse.id}-${Array.isArray(prereq) ? prereq.join('-') : prereq}`,
            type: "prereq",
            message: `${course.department} ${course.number} requires ${prereqDisplay} which is not completed or scheduled in an earlier term`,
            termCode: termPlan.termCode,
            courseId: course.id,
            severity: "error",
          });
        }
      }

      // Check term availability
      if (!offeredTerms.includes(termPlan.termCode)) {
        violations.push({
          id: `term-availability-${plannedCourse.id}`,
          type: "termAvailability",
          message: `${course.department} ${course.number} is not offered in term ${termPlan.termCode}`,
          termCode: termPlan.termCode,
          courseId: course.id,
          severity: "warning",
        });
      }

      // Check abroad mismatch
      if (termPlan.isStudyAbroad && !course.isAbroadOnly) {
        violations.push({
          id: `abroad-mismatch-${plannedCourse.id}`,
          type: "abroadMismatch",
          message: `${course.department} ${course.number} is not an abroad-only course but is placed in a study abroad term`,
          termCode: termPlan.termCode,
          courseId: course.id,
          severity: "warning",
        });
      }

      if (!termPlan.isStudyAbroad && course.isAbroadOnly) {
        violations.push({
          id: `abroad-mismatch-${plannedCourse.id}`,
          type: "abroadMismatch",
          message: `${course.department} ${course.number} is an abroad-only course but is placed in a non-abroad term`,
          termCode: termPlan.termCode,
          courseId: course.id,
          severity: "error",
        });
      }
    }

    // Update completed courses for next iteration
    for (const plannedCourse of termPlan.plannedCourses) {
      if (plannedCourse.isCompleted) {
        completedCourseIds.add(plannedCourse.courseId);
      }
    }
  }

  return violations;
}

