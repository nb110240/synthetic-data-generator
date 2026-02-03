import { NextRequest, NextResponse } from 'next/server';
import { getJob, getJobFile, updateJobData } from '@/lib/job-manager';
import OpenAI from 'openai';

const MODIFY_PROMPT = `You are a data modification assistant. Given a dataset and a user instruction, determine what changes to make.

Analyze the instruction and return a JSON object describing the modification:

{
  "action": "add_row" | "remove_rows" | "update_rows" | "add_column" | "remove_column" | "filter",
  "table": "table_name",
  "details": {
    // For add_row: { "row": { column values } }
    // For remove_rows: { "condition": { "column": "value" } }
    // For update_rows: { "condition": { "column": "value" }, "updates": { "column": "new_value" } }
    // For add_column: { "name": "col_name", "type": "string|number|boolean", "defaultValue": value }
    // For remove_column: { "name": "col_name" }
    // For filter: { "condition": { "column": "value" } }
  }
}

Available tables and their columns will be provided. Return ONLY valid JSON.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, instruction, table } = body;

    if (!jobId || !instruction) {
      return NextResponse.json(
        { error: 'Missing jobId or instruction' },
        { status: 400 }
      );
    }

    const job = getJob(jobId);
    if (!job || job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Job not found or not completed' },
        { status: 404 }
      );
    }

    const content = await getJobFile(jobId, 'data');
    if (!content) {
      return NextResponse.json(
        { error: 'Data file not found' },
        { status: 404 }
      );
    }

    // Parse current data
    const contentStr = content.toString('utf-8');
    let data: Record<string, Record<string, unknown>[]>;

    try {
      const parsed = JSON.parse(contentStr);
      if (parsed.tables) {
        data = parsed.tables;
      } else if (Array.isArray(parsed)) {
        data = { data: parsed };
      } else {
        data = { data: [] };
      }
    } catch {
      // CSV format - parse it
      data = parseMultiTableCSV(contentStr);
    }

    const tableNames = Object.keys(data);
    const targetTable = table || tableNames[0];

    // Get schema info for context
    const schemaInfo = tableNames.map(t => ({
      name: t,
      columns: data[t]?.[0] ? Object.keys(data[t][0]) : [],
      rowCount: data[t]?.length || 0
    }));

    // Use OpenAI to interpret the modification
    const apiKey = process.env.OPENAI_API_KEY;
    let modification: ModificationPlan;

    if (apiKey && apiKey !== 'your-key-here' && apiKey.length > 20) {
      modification = await interpretWithAI(instruction, schemaInfo, targetTable, apiKey);
    } else {
      modification = interpretLocally(instruction, schemaInfo, targetTable);
    }

    // Apply the modification
    const result = applyModification(data, modification);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, message: result.error },
        { status: 400 }
      );
    }

    // Save the modified data
    await updateJobData(jobId, result.data!);

    return NextResponse.json({
      success: true,
      message: result.message,
      modification: modification
    });

  } catch (error) {
    console.error('Modify error:', error);
    return NextResponse.json(
      { error: 'Failed to modify dataset', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

interface ModificationPlan {
  action: 'add_row' | 'remove_rows' | 'update_rows' | 'add_column' | 'remove_column' | 'filter';
  table: string;
  details: Record<string, unknown>;
}

async function interpretWithAI(
  instruction: string,
  schemaInfo: { name: string; columns: string[]; rowCount: number }[],
  targetTable: string,
  apiKey: string
): Promise<ModificationPlan> {
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: MODIFY_PROMPT },
      {
        role: 'user',
        content: `Tables: ${JSON.stringify(schemaInfo, null, 2)}

Target table: ${targetTable}

User instruction: "${instruction}"

Return the modification plan as JSON.`
      }
    ],
    temperature: 0.3,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content || '{}';
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonContent) as ModificationPlan;
}

function interpretLocally(
  instruction: string,
  schemaInfo: { name: string; columns: string[]; rowCount: number }[],
  targetTable: string
): ModificationPlan {
  const lower = instruction.toLowerCase();

  // Simple pattern matching for common operations
  if (lower.includes('add') && (lower.includes('row') || lower.includes('record') || lower.includes('entry'))) {
    // Try to extract values from the instruction
    const columns = schemaInfo.find(s => s.name === targetTable)?.columns || [];
    const row: Record<string, unknown> = {};

    // Set defaults
    for (const col of columns) {
      if (col.includes('id')) {
        row[col] = `custom_${Date.now()}`;
      } else if (col.includes('name')) {
        row[col] = 'New Entry';
      } else if (col.includes('date') || col.includes('time')) {
        row[col] = new Date().toISOString();
      } else if (col.includes('amount') || col.includes('price') || col.includes('total')) {
        row[col] = 0;
      } else if (col.includes('count') || col.includes('quantity')) {
        row[col] = 1;
      } else {
        row[col] = '';
      }
    }

    return { action: 'add_row', table: targetTable, details: { row } };
  }

  if (lower.includes('remove') || lower.includes('delete') || lower.includes('filter out')) {
    return { action: 'filter', table: targetTable, details: { keep: true } };
  }

  // Default: add a row
  return { action: 'add_row', table: targetTable, details: { row: {} } };
}

function applyModification(
  data: Record<string, Record<string, unknown>[]>,
  plan: ModificationPlan
): { success: boolean; data?: Record<string, Record<string, unknown>[]>; message?: string; error?: string } {
  const table = plan.table;

  if (!data[table]) {
    return { success: false, error: `Table "${table}" not found` };
  }

  const newData = { ...data };

  switch (plan.action) {
    case 'add_row': {
      const row = plan.details.row as Record<string, unknown>;
      if (!row || Object.keys(row).length === 0) {
        // Create a row with default values based on existing columns
        const columns = Object.keys(data[table][0] || {});
        const newRow: Record<string, unknown> = {};
        for (const col of columns) {
          newRow[col] = data[table][0]?.[col] ?? '';
        }
        newData[table] = [...data[table], newRow];
      } else {
        newData[table] = [...data[table], row];
      }
      return { success: true, data: newData, message: `Added 1 row to ${table}. Total rows: ${newData[table].length}` };
    }

    case 'remove_rows': {
      const condition = plan.details.condition as Record<string, unknown>;
      if (!condition) {
        return { success: false, error: 'No condition specified for removal' };
      }
      const before = data[table].length;
      newData[table] = data[table].filter(row => {
        return !Object.entries(condition).every(([key, value]) => row[key] === value);
      });
      const removed = before - newData[table].length;
      return { success: true, data: newData, message: `Removed ${removed} rows from ${table}` };
    }

    case 'update_rows': {
      const condition = plan.details.condition as Record<string, unknown>;
      const updates = plan.details.updates as Record<string, unknown>;
      if (!condition || !updates) {
        return { success: false, error: 'Missing condition or updates' };
      }
      let updated = 0;
      newData[table] = data[table].map(row => {
        const matches = Object.entries(condition).every(([key, value]) => row[key] === value);
        if (matches) {
          updated++;
          return { ...row, ...updates };
        }
        return row;
      });
      return { success: true, data: newData, message: `Updated ${updated} rows in ${table}` };
    }

    case 'add_column': {
      const { name, defaultValue } = plan.details as { name: string; defaultValue: unknown };
      if (!name) {
        return { success: false, error: 'Column name required' };
      }
      newData[table] = data[table].map(row => ({ ...row, [name]: defaultValue ?? null }));
      return { success: true, data: newData, message: `Added column "${name}" to ${table}` };
    }

    case 'remove_column': {
      const { name } = plan.details as { name: string };
      if (!name) {
        return { success: false, error: 'Column name required' };
      }
      newData[table] = data[table].map(row => {
        const newRow = { ...row };
        delete newRow[name];
        return newRow;
      });
      return { success: true, data: newData, message: `Removed column "${name}" from ${table}` };
    }

    case 'filter': {
      const condition = plan.details.condition as Record<string, unknown>;
      if (!condition) {
        return { success: true, data: newData, message: 'No filter applied' };
      }
      const before = data[table].length;
      newData[table] = data[table].filter(row => {
        return Object.entries(condition).every(([key, value]) => row[key] === value);
      });
      return { success: true, data: newData, message: `Filtered ${table}: ${before} → ${newData[table].length} rows` };
    }

    default:
      return { success: false, error: `Unknown action: ${plan.action}` };
  }
}

function parseMultiTableCSV(content: string): Record<string, Record<string, unknown>[]> {
  const lines = content.trim().split('\n');
  const tables: Record<string, Record<string, unknown>[]> = {};
  let currentTable = 'data';
  let headers: string[] = [];

  for (const line of lines) {
    if (line.startsWith('### TABLE:')) {
      currentTable = line.replace('### TABLE:', '').replace('###', '').trim();
      tables[currentTable] = [];
      headers = [];
    } else if (line.trim()) {
      if (!tables[currentTable]) {
        tables[currentTable] = [];
      }

      const values = parseCSVLine(line);

      if (headers.length === 0) {
        headers = values;
      } else {
        const row: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          let val: unknown = values[i] || '';
          if (val && !isNaN(Number(val))) val = Number(val);
          else if (val === 'true') val = true;
          else if (val === 'false') val = false;
          row[h] = val;
        });
        tables[currentTable].push(row);
      }
    }
  }

  return tables;
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
