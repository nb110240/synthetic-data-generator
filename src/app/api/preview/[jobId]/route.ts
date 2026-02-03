import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobFile } from '@/lib/job-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { searchParams } = new URL(request.url);
  const tableName = searchParams.get('table') || '';
  const limit = parseInt(searchParams.get('limit') || '10');
  const offset = parseInt(searchParams.get('offset') || '0');

  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (job.status !== 'completed') {
    return NextResponse.json({ error: 'Job not completed' }, { status: 400 });
  }

  const content = await getJobFile(jobId, 'data');
  if (!content) {
    return NextResponse.json({ error: 'Data file not found' }, { status: 404 });
  }

  try {
    const contentStr = content.toString('utf-8');
    let rows: Record<string, unknown>[] = [];
    let headers: string[] = [];

    // Try to parse as JSON first (handles both single and multi-table)
    try {
      const parsed = JSON.parse(contentStr);

      // Check if it's a multi-table format
      if (parsed.tables && typeof parsed.tables === 'object') {
        // Multi-table JSON format
        const tableNames = Object.keys(parsed.tables);
        const targetTable = tableName && tableNames.includes(tableName) ? tableName : tableNames[0];
        rows = parsed.tables[targetTable] || [];
      } else if (Array.isArray(parsed)) {
        // Single table array format
        rows = parsed;
      } else {
        rows = [];
      }

      if (rows.length > 0) {
        headers = Object.keys(rows[0]);
      }
    } catch {
      // Not JSON, try CSV parsing
      const contentLines = contentStr.trim().split('\n');

      // Check for multi-table CSV format (### TABLE: name ###)
      if (contentLines.some(line => line.startsWith('### TABLE:'))) {
        // Parse multi-table CSV
        const tableChunks: Record<string, string[]> = {};
        let currentTable = '';

        for (const line of contentLines) {
          if (line.startsWith('### TABLE:')) {
            currentTable = line.replace('### TABLE:', '').replace('###', '').trim();
            tableChunks[currentTable] = [];
          } else if (currentTable && line.trim()) {
            tableChunks[currentTable].push(line);
          }
        }

        const tableNames = Object.keys(tableChunks);
        const targetTable = tableName && tableNames.includes(tableName) ? tableName : tableNames[0];
        const tableLines = tableChunks[targetTable] || [];

        if (tableLines.length > 0) {
          headers = parseCSVLine(tableLines[0]);
          rows = tableLines.slice(1).map((line) => {
            const values = parseCSVLine(line);
            const row: Record<string, unknown> = {};
            headers.forEach((header, i) => {
              let value: unknown = values[i] || '';
              if (value && !isNaN(Number(value))) {
                value = Number(value);
              } else if (value === 'true') {
                value = true;
              } else if (value === 'false') {
                value = false;
              }
              row[header] = value;
            });
            return row;
          });
        }
      } else {
        // Single table CSV
        if (contentLines.length > 0) {
          headers = parseCSVLine(contentLines[0]);
          rows = contentLines.slice(1).map((line) => {
            const values = parseCSVLine(line);
            const row: Record<string, unknown> = {};
            headers.forEach((header, i) => {
              let value: unknown = values[i] || '';
              if (value && !isNaN(Number(value))) {
                value = Number(value);
              } else if (value === 'true') {
                value = true;
              } else if (value === 'false') {
                value = false;
              }
              row[header] = value;
            });
            return row;
          });
        }
      }
    }

    const totalRows = rows.length;
    const paginatedRows = rows.slice(offset, offset + limit);

    return NextResponse.json({
      headers,
      rows: paginatedRows,
      totalRows,
      table: tableName || 'data',
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Failed to parse data' },
      { status: 500 }
    );
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}
