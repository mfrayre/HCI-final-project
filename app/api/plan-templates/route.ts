import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/plan-templates - Get available template plans
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const majorId = searchParams.get('majorId');

    const templates = await prisma.planTemplate.findMany({
      where: {
        isPublic: true,
        ...(majorId && { majorId }),
      },
      include: {
        major: true,
        plan: {
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
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST /api/plan-templates - Create a template from current plan
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, name, description, isPublic } = body;

    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      include: {
        primaryMajor: true,
        user: true,
      },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    const template = await prisma.planTemplate.create({
      data: {
        name,
        description,
        majorId: plan.primaryMajorId || null,
        planId: plan.id,
        classYear: plan.user.classYear,
        termsOff: plan.termsOff,
        isPublic: isPublic ?? true,
        createdByUserId: plan.userId,
      },
      include: {
        major: true,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}

