import { NextRequest, NextResponse } from 'next/server';
import { GenerationRequestSchema } from '@/lib/types';
import { createJob, setJobUser } from '@/lib/job-manager';
import { createClient } from '@/lib/supabase/server';
import { saveDatasetToSupabase } from '@/lib/dataset-service';

export async function POST(request: NextRequest) {
  try {
    // Check for authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    // Create job
    const job = await createJob(validatedRequest);

    // If user is authenticated, save to Supabase and track user
    if (user) {
      setJobUser(job.id, user.id);
      try {
        await saveDatasetToSupabase(user.id, job);
      } catch (error) {
        console.error('Failed to save to Supabase:', error);
        // Continue even if save fails - job still works in-memory
      }
    }

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
