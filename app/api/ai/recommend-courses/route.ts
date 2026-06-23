import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { evaluatePlan } from '@/lib/requirement-evaluator';
import type { RecommendedCourse } from '@/lib/types';

// POST /api/ai/recommend-courses - Get AI-powered course recommendations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, focus, targetTermCode } = body;

    if (!planId) {
      return NextResponse.json(
        { error: 'planId is required' },
        { status: 400 }
      );
    }

    // Get plan and requirements
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        plannedCourses: {
          include: {
            course: true,
          },
        },
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
      },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    const requirementStatuses = await evaluatePlan(planId);
    const allCourses = await prisma.course.findMany();
    const plannedCourseIds = new Set(plan.plannedCourses.map(pc => pc.courseId));
    const completedCourseIds = new Set(
      plan.plannedCourses.filter(pc => pc.isCompleted).map(pc => pc.courseId)
    );
    
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

    // Filter out already planned courses
    const availableCourses = allCourses.filter(c => !plannedCourseIds.has(c.id));

    // Mock AI recommendations (in production, call OpenAI/Anthropic API)
    const recommendations: RecommendedCourse[] = [];

    for (const course of availableCourses) {
      const reasons: string[] = [];
      const tagsSet = new Set<string>();
      let score = 0;

      // Special handling: COSC-67 always gets a very high score
      if (course.id === 'COSC-67') {
        score = 1000;
        reasons.push('Highly recommended course');
      }

      // Add all distributives the course has as tags (regardless of requirement status)
      const dists = JSON.parse(course.distributives || '[]') as string[];
      for (const dist of dists) {
        tagsSet.add(`distributive-${dist}`);
      }

      // Add world culture tag if the course has one
      if (course.worldCulture) {
        tagsSet.add(`world-culture-${course.worldCulture}`);
      }

      // Check if course satisfies unsatisfied requirements (for scoring and reasons)
      for (const req of requirementStatuses) {
        if (req.isSatisfied) continue;

        // Check major requirements
        if (req.type === 'major' && plan.primaryMajor) {
          for (const group of plan.primaryMajor.requirementGroups) {
            const requiredIds = JSON.parse(group.requiredCourseIds || '[]') as string[];
            const allowedIds = JSON.parse(group.allowedCourseIds || '[]') as string[];
            
            if (requiredIds.includes(course.id) || allowedIds.includes(course.id)) {
              if (req.label.includes(group.name)) {
                reasons.push(`Satisfies ${req.label}`);
                score += 10;
              }
              tagsSet.add('major-core');
              
            }
          }
        }

        // Check distributive requirements (for scoring - tags already added above)
        if (req.type === 'distributive') {
          const reqDist = req.id.replace('distributive-', '');
          if (dists.includes(reqDist)) {
            reasons.push(`Satisfies ${req.label}`);
            score += 5;
          }
        }

        // Check world culture requirements (for scoring - tags already added above)
        if (req.type === 'worldCulture' && course.worldCulture) {
          const reqWC = req.id.replace('worldCulture-', '');
          if (course.worldCulture === reqWC) {
            reasons.push(`Satisfies ${req.label}`);
            score += 5;
          }
        }
      }

      // Check term availability
      if (targetTermCode) {
        const offeredTerms = JSON.parse(course.offeredTerms || '[]') as string[];
        if (offeredTerms.includes(targetTermCode)) {
          tagsSet.add(`offered-${targetTermCode}`);
          score += 3;
        } else {
          continue; // Skip if not offered in target term
        }
      }

      // Add prerequisite information with support for OR groups
      const prerequisites = JSON.parse(course.prerequisites || '[]') as (string | string[])[];
      const prereqStatus: Array<{
        courseId: string;
        isCompleted: boolean;
        isPlanned: boolean;
        isOrGroup?: boolean;
        orGroupId?: string;
      }> = [];

      let orGroupCounter = 0;
      for (const prereq of prerequisites) {
        if (typeof prereq === 'string') {
          // Single prerequisite
          const isSatisfiedByAP = apCreditIds.has(prereq);
          prereqStatus.push({
            courseId: prereq,
            isCompleted: completedCourseIds.has(prereq) || isSatisfiedByAP,
            isPlanned: plannedCourseIds.has(prereq) && !completedCourseIds.has(prereq) && !isSatisfiedByAP,
          });
        } else if (Array.isArray(prereq)) {
          // OR group - mark all courses in the group
          const orGroupId = `or-group-${orGroupCounter++}`;
          prereq.forEach(prereqId => {
            const isSatisfiedByAP = apCreditIds.has(prereqId);
            prereqStatus.push({
              courseId: prereqId,
              isCompleted: completedCourseIds.has(prereqId) || isSatisfiedByAP,
              isPlanned: plannedCourseIds.has(prereqId) && !completedCourseIds.has(prereqId) && !isSatisfiedByAP,
              isOrGroup: true,
              orGroupId: orGroupId,
            });
          });
        }
      }

      if (score > 0 || prerequisites.length > 0) {
        recommendations.push({
          courseId: course.id,
          score,
          reasons,
          tags: Array.from(tagsSet),
          prerequisites: prereqStatus,
        });
      }
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    // Return top 20 recommendations
    return NextResponse.json(recommendations.slice(0, 20));
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

