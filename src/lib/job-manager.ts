import { nanoid } from 'nanoid';
import { promises as fs } from 'fs';
import path from 'path';
import type { GenerationJob, GenerationRequest, GeneratedFiles } from './types';
import { planSchema } from './schema-planner';
import { generateData } from './data-generator';
import { formatOutput } from './output-formatter';

// Use global to persist jobs across Next.js hot reloads in development
const globalForJobs = globalThis as unknown as {
  jobs: Map<string, GenerationJob> | undefined;
  jobUsers: Map<string, string> | undefined;
};

// In-memory job storage (replace with Redis/database for production)
const jobs = globalForJobs.jobs ?? new Map<string, GenerationJob>();
globalForJobs.jobs = jobs;

// Track which user owns which job (for Supabase sync)
const jobUsers = globalForJobs.jobUsers ?? new Map<string, string>();
globalForJobs.jobUsers = jobUsers;

// Set user for a job (called from API route)
export function setJobUser(jobId: string, userId: string): void {
  jobUsers.set(jobId, userId);
}

// Get user for a job
export function getJobUser(jobId: string): string | undefined {
  return jobUsers.get(jobId);
}

// Base directory for generated files
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/tmp/synthetic-datasets';

export async function createJob(request: GenerationRequest): Promise<GenerationJob> {
  const job: GenerationJob = {
    id: nanoid(12),
    status: 'queued',
    progress: 0,
    request,
    createdAt: new Date(),
  };

  jobs.set(job.id, job);

  // Start processing in background
  processJob(job.id).catch(error => {
    console.error(`Job ${job.id} failed:`, error);
    updateJob(job.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  return job;
}

export function getJob(jobId: string): GenerationJob | undefined {
  return jobs.get(jobId);
}

export function updateJob(jobId: string, updates: Partial<GenerationJob>): void {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
    jobs.set(jobId, job);

    // Sync to Supabase if user is associated with this job
    const userId = jobUsers.get(jobId);
    if (userId) {
      // Dynamic import to avoid circular dependency
      import('./dataset-service').then(({ saveDatasetToSupabase }) => {
        saveDatasetToSupabase(userId, job).catch((err) => {
          console.error('Supabase sync error:', err);
        });
      });
    }
  }
}

async function processJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) throw new Error('Job not found');

  const seed = job.request.seed ?? Math.floor(Math.random() * 1000000);
  const openaiApiKey = process.env.OPENAI_API_KEY;

  try {
    // Stage 1: Schema Planning
    updateJob(jobId, { status: 'planning', progress: 10 });

    const schema = await planSchema(job.request, openaiApiKey);
    updateJob(jobId, { schema, progress: 30 });

    // Stage 2: Data Generation
    updateJob(jobId, { status: 'generating', progress: 40 });

    const data = await generateData(
      schema,
      seed,
      job.request.options?.nullPercentage ?? 0.02,
      job.request.options?.includeEdgeCases ?? true,
      (progress, message) => {
        const overallProgress = 40 + Math.floor(progress * 0.4);
        updateJob(jobId, { progress: overallProgress });
      }
    );

    updateJob(jobId, { progress: 80 });

    // Stage 3: Validation & Formatting
    updateJob(jobId, { status: 'validating', progress: 85 });

    const output = await formatOutput(schema, data, job.request, seed);

    // Stage 4: Write files
    updateJob(jobId, { progress: 90 });

    const jobDir = path.join(OUTPUT_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const extension = job.request.format === 'parquet' ? 'json' : job.request.format;
    const files: GeneratedFiles = {
      data: path.join(jobDir, `data.${extension}`),
      schema: path.join(jobDir, 'schema.json'),
      metadata: path.join(jobDir, 'metadata.json'),
      readme: path.join(jobDir, 'README.md'),
    };

    await Promise.all([
      fs.writeFile(files.data, output.dataFile),
      fs.writeFile(files.schema, output.schemaFile),
      fs.writeFile(files.metadata, output.metadataFile),
      fs.writeFile(files.readme, output.readmeFile),
    ]);

    // Complete
    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      files,
      completedAt: new Date(),
    });
  } catch (error) {
    updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export async function getJobFile(jobId: string, filename: string): Promise<Buffer | null> {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'completed' || !job.files) {
    return null;
  }

  const filePath = job.files[filename as keyof GeneratedFiles];
  if (!filePath) return null;

  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function updateJobData(
  jobId: string,
  newData: Record<string, Record<string, unknown>[]>
): Promise<void> {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'completed' || !job.files) {
    throw new Error('Job not found or not completed');
  }

  // Format based on original request format
  let content: string;
  if (job.request.format === 'json' || Object.keys(newData).length > 1) {
    // Multi-table or JSON format
    content = JSON.stringify({ tables: newData }, null, 2);
  } else {
    // Single table CSV
    const tableName = Object.keys(newData)[0];
    const rows = newData[tableName];
    if (rows.length === 0) {
      content = '';
    } else {
      const headers = Object.keys(rows[0]);
      const headerLine = headers.join(',');
      const dataLines = rows.map(row =>
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        }).join(',')
      );
      content = [headerLine, ...dataLines].join('\n');
    }
  }

  // Write updated data file
  await fs.writeFile(job.files.data, content);
}

export function cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  const entries = Array.from(jobs.entries());
  for (const [id, job] of entries) {
    if (now - job.createdAt.getTime() > maxAgeMs) {
      jobs.delete(id);
      // Also cleanup files
      const jobDir = path.join(OUTPUT_DIR, id);
      fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// Run cleanup every hour
setInterval(() => cleanupOldJobs(), 60 * 60 * 1000);
