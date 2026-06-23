import { NextRequest, NextResponse } from 'next/server';
import { evaluateViolations } from '@/lib/violations-engine';

// GET /api/violations - Get violations for a plan
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const planId = searchParams.get('planId');

    if (!planId) {
      return NextResponse.json(
        { error: 'planId is required' },
        { status: 400 }
      );
    }

    const violations = await evaluateViolations(planId);
    return NextResponse.json(violations);
  } catch (error) {
    console.error('Error evaluating violations:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate violations' },
      { status: 500 }
    );
  }
}

