import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/plan/submit - Submit plan for major declaration
export async function POST(request: NextRequest) {
  try {
    const userEmail = request.headers.get('x-user-id');
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu` },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's plan
    const plan = await prisma.plan.findFirst({
      where: { userId: user.id },
      include: {
        primaryMajor: true,
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
      return NextResponse.json(
        { error: 'No plan found. Please create a plan first.' },
        { status: 400 }
      );
    }

    if (!plan.primaryMajorId) {
      return NextResponse.json(
        { error: 'Please select a primary major before submitting.' },
        { status: 400 }
      );
    }

    // Update plan status to "submitted"
    const updatedPlan = await prisma.plan.update({
      where: { id: plan.id },
      data: { status: 'submitted' },
    });

    // TODO: In a real implementation, this would:
    // 1. Validate the plan meets all requirements
    // 2. Create a submission record in the database
    // 3. Send notifications to advisors

    return NextResponse.json({
      success: true,
      message: 'Plan submitted successfully for major declaration review.',
      planId: updatedPlan.id,
      status: updatedPlan.status,
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error submitting plan:', error);
    return NextResponse.json(
      { error: `Failed to submit plan: ${errorMessage}` },
      { status: 500 }
    );
  }
}

