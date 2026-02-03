import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    );
  }

  const response: Record<string, unknown> = {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt.toISOString(),
  };

  if (job.status === 'completed') {
    response.completedAt = job.completedAt?.toISOString();
    response.files = {
      data: `/api/download/${job.id}/data`,
      schema: `/api/download/${job.id}/schema`,
      metadata: `/api/download/${job.id}/metadata`,
      readme: `/api/download/${job.id}/readme`,
    };
    response.schema = job.schema;
  }

  if (job.status === 'failed') {
    response.error = job.error;
  }

  return NextResponse.json(response);
}
