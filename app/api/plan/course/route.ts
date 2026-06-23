import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { shouldMarkCourseCompleted } from '@/lib/violations-engine';

// POST /api/plan/course - Add a planned course
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, termPlanId, courseId, isCompleted, source } = body;

    if (!planId || !termPlanId || !courseId) {
      return NextResponse.json(
        { error: 'planId, termPlanId, and courseId are required' },
        { status: 400 }
      );
    }

    // Get the term plan to get the term code
    const termPlan = await prisma.termPlan.findUnique({
      where: { id: termPlanId },
    });

    if (!termPlan) {
      return NextResponse.json(
        { error: 'Term plan not found' },
        { status: 404 }
      );
    }

    // Check if course already exists anywhere in the plan
    const existing = await prisma.plannedCourse.findFirst({
      where: {
        planId,
        courseId,
      },
      include: {
        termPlan: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        { 
          error: `Course ${courseId} is already in your plan (${existing.termPlan.termCode})`,
          existingCourse: existing,
        },
        { status: 409 } // 409 Conflict
      );
    }

    // Determine ifCompleted based on term code if not explicitly provided
    // If isCompleted is explicitly provided (e.g., from transcript import), use that
    // Otherwise, automatically determine based on whether term is before current term
    const shouldBeCompleted = isCompleted !== undefined 
      ? isCompleted 
      : shouldMarkCourseCompleted(termPlan.termCode);

    const plannedCourse = await prisma.plannedCourse.create({
      data: {
        planId,
        termPlanId,
        courseId,
        isCompleted: shouldBeCompleted,
        source: source || 'planned',
      },
      include: {
        course: true,
        termPlan: true,
      },
    });

    return NextResponse.json(plannedCourse);
  } catch (error) {
    console.error('Error adding planned course:', error);
    return NextResponse.json(
      { error: 'Failed to add planned course' },
      { status: 500 }
    );
  }
}

