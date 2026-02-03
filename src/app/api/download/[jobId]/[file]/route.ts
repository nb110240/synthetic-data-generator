import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobFile } from '@/lib/job-manager';

const FILE_MAP: Record<string, { key: string; contentType: string; extension: string }> = {
  data: { key: 'data', contentType: 'text/csv', extension: 'csv' },
  schema: { key: 'schema', contentType: 'application/json', extension: 'json' },
  metadata: { key: 'metadata', contentType: 'application/json', extension: 'json' },
  readme: { key: 'readme', contentType: 'text/markdown', extension: 'md' },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; file: string }> }
) {
  const { jobId, file } = await params;
  const { searchParams } = new URL(request.url);
  const requestedFormat = searchParams.get('format');

  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    );
  }

  if (job.status !== 'completed') {
    return NextResponse.json(
      { error: 'Job not yet completed', status: job.status },
      { status: 400 }
    );
  }

  const fileInfo = FILE_MAP[file];
  if (!fileInfo) {
    return NextResponse.json(
      { error: 'Unknown file type' },
      { status: 400 }
    );
  }

  const content = await getJobFile(jobId, fileInfo.key);
  if (!content) {
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    );
  }

  // Determine content type and filename based on format
  let contentType = fileInfo.contentType;
  let filename = `${file}.${fileInfo.extension}`;
  let outputContent: Buffer | string = content;

  if (file === 'data') {
    const format = requestedFormat || job.request.format;

    switch (format) {
      case 'json':
        contentType = 'application/json';
        filename = 'data.json';
        // If original is CSV, convert to JSON
        if (job.request.format === 'csv') {
          outputContent = convertCsvToJson(content.toString('utf-8'));
        }
        break;
      case 'csv':
        contentType = 'text/csv';
        filename = 'data.csv';
        // If original is JSON, convert to CSV
        if (job.request.format === 'json') {
          outputContent = convertJsonToCsv(content.toString('utf-8'));
        }
        break;
      case 'parquet':
        // Parquet not fully implemented, return JSON with .parquet extension
        contentType = 'application/octet-stream';
        filename = 'data.parquet.json';
        if (job.request.format === 'csv') {
          outputContent = convertCsvToJson(content.toString('utf-8'));
        }
        break;
      default:
        contentType = 'text/csv';
        filename = 'data.csv';
    }
  }

  const finalContent = typeof outputContent === 'string'
    ? new TextEncoder().encode(outputContent)
    : new Uint8Array(outputContent);

  return new NextResponse(finalContent, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function convertCsvToJson(csvContent: string): string {
  const lines = csvContent.trim().split('\n');
  if (lines.length === 0) return '[]';

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      let value: unknown = values[i] || '';
      // Try to parse numbers
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

  return JSON.stringify(rows, null, 2);
}

function convertJsonToCsv(jsonContent: string): string {
  try {
    const data = JSON.parse(jsonContent);
    const tableData = Array.isArray(data) ? data : Object.values(data.tables || {})[0];
    const rows: Record<string, unknown>[] = Array.isArray(tableData) ? tableData : [];

    if (rows.length === 0) return '';

    const headers = Object.keys(rows[0]);
    const headerLine = headers.map((h) => `"${h}"`).join(',');

    const dataLines = rows.map((row) =>
      headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      }).join(',')
    );

    return [headerLine, ...dataLines].join('\n');
  } catch {
    return jsonContent;
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
