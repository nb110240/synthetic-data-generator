import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobFile } from '@/lib/job-manager';

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
    response.schema = job.schema;

    // Include actual file contents for client-side download
    // This avoids the serverless memory issue where download requests hit different instances
    try {
      const [dataFile, schemaFile, metadataFile, readmeFile] = await Promise.all([
        getJobFile(jobId, 'data'),
        getJobFile(jobId, 'schema'),
        getJobFile(jobId, 'metadata'),
        getJobFile(jobId, 'readme'),
      ]);

      response.fileContents = {
        data: dataFile?.toString('utf-8') || null,
        schema: schemaFile?.toString('utf-8') || null,
        metadata: metadataFile?.toString('utf-8') || null,
        readme: readmeFile?.toString('utf-8') || null,
      };
    } catch (err) {
      console.error('Failed to read job files:', err);
      response.fileContents = null;
    }
  }

  if (job.status === 'failed') {
    response.error = job.error;
  }

  return NextResponse.json(response);
}
