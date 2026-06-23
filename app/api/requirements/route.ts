import { NextRequest, NextResponse } from 'next/server';
import { evaluatePlan } from '@/lib/requirement-evaluator';

// GET /api/requirements - Get requirement statuses for a plan
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

    const requirementStatuses = await evaluatePlan(planId);
    return NextResponse.json(requirementStatuses);
  } catch (error) {
    console.error('Error evaluating requirements:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate requirements' },
      { status: 500 }
    );
  }
}

