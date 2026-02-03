import { createClient } from '@/lib/supabase/server';
import type { GenerationJob } from './types';
import type { Dataset, DatasetInsert } from '@/lib/supabase/types';

export async function saveDatasetToSupabase(
  userId: string,
  job: GenerationJob
): Promise<void> {
  const supabase = await createClient();

  const datasetRecord: DatasetInsert = {
    job_id: job.id,
    user_id: userId,
    description: job.request.description,
    rows: job.request.rows,
    format: job.request.format,
    seed: job.request.seed ?? null,
    options: job.request.options ?? {},
    schema: job.schema ? JSON.parse(JSON.stringify(job.schema)) : null,
    status: job.status,
    progress: job.progress,
    error: job.error ?? null,
    files: job.files ? JSON.parse(JSON.stringify(job.files)) : null,
    completed_at: job.completedAt?.toISOString() ?? null,
  };

  // Use type assertion since the database may not exist yet during build
  const { error } = await (supabase.from('datasets') as ReturnType<typeof supabase.from>).upsert(
    datasetRecord as never,
    { onConflict: 'job_id' }
  );

  if (error) throw error;
}

export async function getUserDatasets(
  userId: string,
  limit: number = 5
): Promise<Dataset[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function getDatasetByJobId(
  userId: string,
  jobId: string
): Promise<Dataset | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}
