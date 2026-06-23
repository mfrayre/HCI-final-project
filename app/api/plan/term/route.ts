import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/plan/term - Create or update term plan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, termCode, maxCourses, isStudyAbroad } = body;

    if (!planId || !termCode) {
      return NextResponse.json(
        { error: 'planId and termCode are required' },
        { status: 400 }
      );
    }

    const termPlan = await prisma.termPlan.upsert({
      where: {
        planId_termCode: {
          planId,
          termCode,
        },
      },
      update: {
        maxCourses: maxCourses ?? undefined,
        isStudyAbroad: isStudyAbroad ?? undefined,
      },
      create: {
        planId,
        termCode,
        maxCourses: maxCourses ?? 4,
        isStudyAbroad: isStudyAbroad ?? false,
      },
      include: {
        plannedCourses: {
          include: {
            course: true,
          },
        },
      },
    });

    return NextResponse.json(termPlan);
  } catch (error) {
    console.error('Error updating term plan:', error);
    return NextResponse.json(
      { error: 'Failed to update term plan' },
      { status: 500 }
    );
  }
}

