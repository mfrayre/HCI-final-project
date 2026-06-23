import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/majors - Get all majors
export async function GET() {
  try {
    const majors = await prisma.major.findMany({
      orderBy: {
        name: 'asc',
      },
    });
    return NextResponse.json(majors);
  } catch (error) {
    console.error('Error fetching majors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch majors' },
      { status: 500 }
    );
  }
}

