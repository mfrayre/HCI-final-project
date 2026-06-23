import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/plans - Get all plans for the current user
export async function GET(request: NextRequest) {
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

    const plans = await prisma.plan.findMany({
      where: { userId: user.id },
      include: {
        primaryMajor: {
          select: { name: true },
        },
        secondaryMajor: {
          select: { name: true },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}

// POST /api/plans - Create a new plan
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
    const { name, primaryMajorId, secondaryMajorId, minors, planType, termsOff } = body;

    const user = await prisma.user.findUnique({
      where: { email: userEmail.includes('@') ? userEmail : `${userEmail}@dartmouth.edu` },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const plan = await prisma.plan.create({
      data: {
        userId: user.id,
        name: name || `Plan ${new Date().toLocaleDateString()}`,
        primaryMajorId: primaryMajorId || null,
        secondaryMajorId: secondaryMajorId || null,
        minors: minors ? JSON.stringify(minors) : JSON.stringify([]),
        planType: planType || 'full',
        termsOff: termsOff ? JSON.stringify(termsOff) : JSON.stringify([]),
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

    return NextResponse.json(plan);
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json(
      { error: 'Failed to create plan' },
      { status: 500 }
    );
  }
}

