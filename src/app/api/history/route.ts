import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserDatasets } from '@/lib/dataset-service';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const datasets = await getUserDatasets(user.id, 5);
    return NextResponse.json({ datasets });
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
