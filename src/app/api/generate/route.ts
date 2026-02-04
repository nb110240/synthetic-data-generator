import { NextRequest, NextResponse } from 'next/server';
import { GenerationRequestSchema } from '@/lib/types';
import { createJob } from '@/lib/job-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parseResult = GenerationRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const validatedRequest = parseResult.data;

    // Create job (in-memory)
    const job = await createJob(validatedRequest);

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      message: 'Dataset generation started',
      statusUrl: `/api/status/${job.id}`,
    });
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start generation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
