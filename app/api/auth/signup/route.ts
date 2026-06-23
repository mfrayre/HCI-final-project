import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/auth/signup - Create a new user account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, classYear } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!password || password.length < 1) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Normalize email
    const normalizedEmail = email.includes('@') ? email.toLowerCase().trim() : `${email}@dartmouth.edu`;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Create new user
    // In production, hash the password before storing
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name || 'User',
        classYear: classYear || 2026,
      },
    });

    return NextResponse.json({
      email: user.email,
      name: user.name,
      classYear: user.classYear,
    });
  } catch (error) {
    console.error('Error during signup:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

