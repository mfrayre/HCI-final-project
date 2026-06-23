import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { shouldMarkCourseCompleted } from '@/lib/violations-engine';

// PATCH /api/plan/course/:id - Update planned course (move between terms, toggle completion)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { termPlanId, isCompleted } = body;

    const updateData: any = {};
    
    // If termPlanId is being updated, get the new term plan to determine completion status
    if (termPlanId !== undefined) {
      updateData.termPlanId = termPlanId;
      
      // Get the term plan to determine if course should be completed
      const termPlan = await prisma.termPlan.findUnique({
        where: { id: termPlanId },
      });
      
      if (termPlan) {
        // If isCompleted is explicitly provided, use that
        // Otherwise, automatically determine based on term code
        if (isCompleted !== undefined) {
          updateData.isCompleted = isCompleted;
        } else {
          updateData.isCompleted = shouldMarkCourseCompleted(termPlan.termCode);
        }
      }
    } else if (isCompleted !== undefined) {
      // If only isCompleted is being updated (not moving terms), use the provided value
      updateData.isCompleted = isCompleted;
    }

    const plannedCourse = await prisma.plannedCourse.update({
      where: { id },
      data: updateData,
      include: {
        course: true,
        termPlan: true,
      },
    });

    return NextResponse.json(plannedCourse);
  } catch (error) {
    console.error('Error updating planned course:', error);
    return NextResponse.json(
      { error: 'Failed to update planned course' },
      { status: 500 }
    );
  }
}

// DELETE /api/plan/course/:id - Remove planned course
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await prisma.plannedCourse.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting planned course:', error);
    return NextResponse.json(
      { error: 'Failed to delete planned course' },
      { status: 500 }
    );
  }
}

