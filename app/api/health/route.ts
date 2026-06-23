import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Test database connection
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbTime = Date.now() - startTime;

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      dbResponseTime: `${dbTime}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Health check failed:', errorMessage);
    return NextResponse.json(
      {
        status: 'error',
        database: 'disconnected',
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
