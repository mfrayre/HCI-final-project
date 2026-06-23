import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// PATCH /api/plan/[id] - Update plan (e.g., name)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userEmail = request.headers.get('x-user-id');
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu` },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const planId = params.id;
    const body = await request.json();
    const { name } = body;

    // Verify plan belongs to user
    const existingPlan = await prisma.plan.findFirst({
      where: {
        id: planId,
        userId: user.id,
      },
    });

    if (!existingPlan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    const updatedPlan = await prisma.plan.update({
      where: { id: planId },
      data: {
        ...(name !== undefined && { name }),
      },
    });

    return NextResponse.json(updatedPlan);
  } catch (error) {
    console.error('Error updating plan:', error);
    return NextResponse.json(
      { error: 'Failed to update plan' },
      { status: 500 }
    );
  }
}

// DELETE /api/plan/[id] - Delete a plan
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userEmail = request.headers.get('x-user-id');
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu` },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const planId = params.id;

    // Verify plan belongs to user
    const existingPlan = await prisma.plan.findFirst({
      where: {
        id: planId,
        userId: user.id,
      },
    });

    if (!existingPlan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    // Check if this is the only plan
    const planCount = await prisma.plan.count({
      where: { userId: user.id },
    });

    if (planCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the only plan. Please create another plan first.' },
        { status: 400 }
      );
    }

    await prisma.plan.delete({
      where: { id: planId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return NextResponse.json(
      { error: 'Failed to delete plan' },
      { status: 500 }
    );
  }
}

