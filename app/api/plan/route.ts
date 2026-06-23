import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { evaluatePlan } from '@/lib/requirement-evaluator';
import { evaluateViolations } from '@/lib/violations-engine';

// GET /api/plan - Get user's plan with all relations
// Query params: ?planId=<id> to get a specific plan, otherwise gets the first/default plan
export async function GET(request: NextRequest) {
  try {
    // Get user ID from request headers
    const userEmail = request.headers.get('x-user-id');
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }
    
    // Get planId from query params
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('planId');
    
    // Get or create user
    const user = await prisma.user.upsert({
      where: { email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu` },
      update: {},
      create: {
        email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu`,
        name: 'Mock User',
        classYear: 2026,
      },
    });

    let plan;
    if (planId) {
      // Get specific plan
      plan = await prisma.plan.findFirst({
        where: { 
          id: planId,
          userId: user.id, // Ensure plan belongs to user
        },
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
          termPlans: {
            include: {
              plannedCourses: {
                include: {
                  course: true,
                },
              },
            },
            orderBy: {
              termCode: 'asc',
            },
          },
        },
      });
    }
    
    // If planId was provided but plan not found, or no planId provided, get any plan for user
    if (!plan) {
      plan = await prisma.plan.findFirst({
        where: { userId: user.id },
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
          termPlans: {
            include: {
              plannedCourses: {
                include: {
                  course: true,
                },
              },
            },
            orderBy: {
              termCode: 'asc',
            },
          },
        },
        orderBy: {
          updatedAt: 'desc', // Get most recently updated plan
        },
      });
    }

    // Only create a new plan if absolutely no plans exist for the user
    if (!plan) {
      // Create a default plan if none exists
      plan = await prisma.plan.create({
        data: {
          userId: user.id,
          // @ts-expect-error - name field exists in schema but TypeScript types may need server restart
          name: 'My Plan',
          minors: JSON.stringify([]),
        },
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
          termPlans: {
            include: {
              plannedCourses: {
                include: {
                  course: true,
                },
              },
            },
            orderBy: {
              termCode: 'asc',
            },
          },
        },
      });
    }

    const requirementStatuses = await evaluatePlan(plan.id);
    const violations = await evaluateViolations(plan.id);

    return NextResponse.json({
      plan,
      requirementStatuses,
      violations,
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan' },
      { status: 500 }
    );
  }
}

// POST /api/plan - Create or update plan
export async function POST(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-id');
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }
    const body = await request.json();
    const { primaryMajorId, secondaryMajorId, minors, classYear, planType, termsOff, apCredits, templateId } = body;

    // Get or create user
    const user = await prisma.user.upsert({
      where: { email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu` },
      update: classYear ? { classYear } : {},
      create: {
        email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu`,
        name: 'Mock User',
        classYear: classYear || 2026,
      },
    });

    let plan = await prisma.plan.findFirst({
      where: { userId: user.id },
      include: {
        primaryMajor: true,
        secondaryMajor: true,
        termPlans: true,
      },
    });

    if (plan) {
      const updateData: any = {};
      
      // Always update these fields if provided
      if (primaryMajorId !== undefined) {
        updateData.primaryMajorId = primaryMajorId === '' || primaryMajorId === null ? null : primaryMajorId;
      }
      if (secondaryMajorId !== undefined) {
        updateData.secondaryMajorId = secondaryMajorId === '' || secondaryMajorId === null ? null : secondaryMajorId;
      }
      if (minors !== undefined) {
        updateData.minors = Array.isArray(minors) ? JSON.stringify(minors) : JSON.stringify([]);
      }
      if (planType !== undefined) {
        updateData.planType = planType;
      }
      if (termsOff !== undefined) {
        updateData.termsOff = Array.isArray(termsOff) ? JSON.stringify(termsOff) : JSON.stringify([]);
      }
      
      if (apCredits !== undefined) {
        // apCredits is now a Record<string, string> (AP course name -> Dartmouth course ID)
        updateData.apCredits = typeof apCredits === 'object' && apCredits !== null 
          ? JSON.stringify(apCredits) 
          : JSON.stringify({});
      }
      
      if (Object.keys(updateData).length > 0) {
        plan = await prisma.plan.update({
          where: { id: plan.id },
          data: updateData,
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
            termPlans: true,
          },
        });
      }
    } else {
      // If templateId is provided, copy from template
      let templatePlan = null;
      if (templateId) {
        const template = await prisma.planTemplate.findUnique({
          where: { id: templateId },
          include: {
            plan: {
              include: {
                termPlans: {
                  include: {
                    plannedCourses: true,
                  },
                },
              },
            },
          },
        });
        if (template) {
          templatePlan = template.plan;
        }
      }

      plan = await prisma.plan.create({
        data: {
          userId: user.id,
          primaryMajorId: primaryMajorId || null,
          secondaryMajorId: secondaryMajorId || null,
          minors: minors ? JSON.stringify(minors) : JSON.stringify([]),
          planType: planType || 'full',
          termsOff: termsOff ? JSON.stringify(termsOff) : JSON.stringify([]),
          apCredits: apCredits ? JSON.stringify(apCredits) : JSON.stringify({}),
        } as any,
        include: {
          primaryMajor: true,
          secondaryMajor: true,
          termPlans: true,
        },
      });
    }

    // User already updated above if classYear was provided

    // Return updated plan with all relations
    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }
    
    const updatedPlan = await prisma.plan.findUnique({
      where: { id: plan.id },
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
        termPlans: {
          include: {
            plannedCourses: {
              include: {
                course: true,
              },
            },
          },
          orderBy: {
            termCode: 'asc',
          },
        },
      },
    });

    return NextResponse.json(updatedPlan);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error updating plan:', errorMessage);
    console.error('Stack:', errorStack);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { error: 'Failed to update plan', details: errorMessage, stack: errorStack },
      { status: 500 }
    );
  }
}

