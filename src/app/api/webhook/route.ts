import { NextRequest, NextResponse } from 'next/server';
import { GenerationRequestSchema } from '@/lib/types';
import { createJob, getJob } from '@/lib/job-manager';

/**
 * Webhook endpoint for n8n integration
 *
 * This endpoint accepts POST requests from n8n workflows and:
 * 1. Starts a dataset generation job
 * 2. Optionally waits for completion (sync mode)
 * 3. Returns job status and download URLs
 *
 * n8n can use this with:
 * - HTTP Request node (POST to /api/webhook)
 * - Poll for status at /api/status/{jobId}
 * - Download files from /api/download/{jobId}/{file}
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if sync mode is requested (wait for completion)
    const syncMode = body.sync === true;
    const callbackUrl = body.callbackUrl as string | undefined;

    // Validate generation request
    const parseResult = GenerationRequestSchema.safeParse({
      description: body.description || body.prompt,
      rows: body.rows || 1000,
      format: body.format || 'csv',
      seed: body.seed,
      options: body.options,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const validatedRequest = parseResult.data;

    // Create job
    const job = await createJob(validatedRequest);

    // Sync mode: wait for completion
    if (syncMode) {
      const result = await waitForCompletion(job.id, 120000); // 2 minute timeout

      if (result.status === 'completed') {
        return NextResponse.json({
          success: true,
          jobId: result.id,
          status: result.status,
          files: {
            data: `/api/download/${result.id}/data`,
            schema: `/api/download/${result.id}/schema`,
            metadata: `/api/download/${result.id}/metadata`,
            readme: `/api/download/${result.id}/readme`,
          },
          schema: result.schema,
        });
      } else {
        return NextResponse.json({
          success: false,
          jobId: result.id,
          status: result.status,
          error: result.error,
        });
      }
    }

    // Async mode: return immediately
    // If callback URL provided, we'll POST results there when done
    if (callbackUrl) {
      waitForCompletionAndCallback(job.id, callbackUrl);
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      message: 'Dataset generation started',
      statusUrl: `/api/status/${job.id}`,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process webhook',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

async function waitForCompletion(jobId: string, timeoutMs: number) {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const job = getJob(jobId);
    if (!job) throw new Error('Job not found');

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Job timed out');
}

async function waitForCompletionAndCallback(jobId: string, callbackUrl: string) {
  try {
    const result = await waitForCompletion(jobId, 300000); // 5 minute timeout

    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: result.status === 'completed',
        jobId: result.id,
        status: result.status,
        files: result.files
          ? {
              data: `/api/download/${result.id}/data`,
              schema: `/api/download/${result.id}/schema`,
              metadata: `/api/download/${result.id}/metadata`,
              readme: `/api/download/${result.id}/readme`,
            }
          : undefined,
        error: result.error,
      }),
    });
  } catch (error) {
    console.error('Callback failed:', error);
  }
}
