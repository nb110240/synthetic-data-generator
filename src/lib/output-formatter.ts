import Papa from 'papaparse';
import type {
  DatasetSchema,
  DatasetMetadata,
  GenerationRequest,
  GeneratedFiles
} from './types';
import type { GeneratedData } from './data-generator';

export interface FormattedOutput {
  dataFile: string;
  schemaFile: string;
  metadataFile: string;
  readmeFile: string;
}

export async function formatOutput(
  schema: DatasetSchema,
  data: GeneratedData,
  request: GenerationRequest,
  seed: number
): Promise<FormattedOutput> {
  // Generate data file based on format
  const dataFile = await formatData(data, request.format);

  // Generate JSON Schema
  const schemaFile = generateJsonSchema(schema);

  // Generate metadata
  const metadataFile = generateMetadata(schema, data, request, seed);

  // Generate README
  const readmeFile = generateReadme(schema, data, request);

  return {
    dataFile,
    schemaFile,
    metadataFile,
    readmeFile,
  };
}

async function formatData(
  data: GeneratedData,
  format: 'csv' | 'json' | 'parquet'
): Promise<string> {
  const tables = Array.from(data.tables.entries());

  // For multi-table datasets, store all tables in a structured format
  if (tables.length > 1) {
    // Create an object with all tables
    const allTables: Record<string, Record<string, unknown>[]> = {};
    for (const [name, rows] of tables) {
      allTables[name] = rows;
    }

    switch (format) {
      case 'csv':
        // For CSV with multiple tables, we'll use a special format
        // Each table is separated by a header line
        let csvOutput = '';
        for (const [name, rows] of tables) {
          if (csvOutput) csvOutput += '\n\n';
          csvOutput += `### TABLE: ${name} ###\n`;
          csvOutput += Papa.unparse(rows);
        }
        return csvOutput;

      case 'json':
        return JSON.stringify({ tables: allTables }, null, 2);

      case 'parquet':
        return JSON.stringify({ tables: allTables }, null, 2);

      default:
        return JSON.stringify({ tables: allTables }, null, 2);
    }
  }

  // Single table - simple format
  const mainTable = tables[0]?.[1] || [];

  switch (format) {
    case 'csv':
      return Papa.unparse(mainTable);

    case 'json':
      return JSON.stringify(mainTable, null, 2);

    case 'parquet':
      // Parquet requires special handling - return JSON for now
      // In production, use parquetjs to write actual Parquet files
      return JSON.stringify(mainTable, null, 2);

    default:
      return Papa.unparse(mainTable);
  }
}

function generateJsonSchema(schema: DatasetSchema): string {
  const jsonSchemas: Record<string, object> = {};

  for (const table of schema.tables) {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const column of table.columns) {
      properties[column.name] = columnToJsonSchema(column);
      if (!column.nullable) {
        required.push(column.name);
      }
    }

    jsonSchemas[table.name] = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: table.name,
      description: table.description,
      type: 'object',
      properties,
      required,
    };
  }

  // If single table, return just that schema
  if (Object.keys(jsonSchemas).length === 1) {
    return JSON.stringify(Object.values(jsonSchemas)[0], null, 2);
  }

  // Multiple tables: wrap in container
  return JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: schema.name,
    description: schema.description,
    type: 'object',
    properties: jsonSchemas,
  }, null, 2);
}

function columnToJsonSchema(column: {
  name: string;
  type: string;
  description: string;
  nullable: boolean;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  enumValues?: string[];
}): object {
  const base: Record<string, unknown> = {
    description: column.description,
  };

  switch (column.type) {
    case 'string':
    case 'email':
    case 'phone':
    case 'url':
    case 'address':
    case 'name':
    case 'company':
      base.type = 'string';
      if (column.minLength) base.minLength = column.minLength;
      if (column.maxLength) base.maxLength = column.maxLength;
      if (column.enumValues) base.enum = column.enumValues;
      if (column.type === 'email') base.format = 'email';
      if (column.type === 'url') base.format = 'uri';
      break;

    case 'integer':
      base.type = 'integer';
      if (column.minValue !== undefined) base.minimum = column.minValue;
      if (column.maxValue !== undefined) base.maximum = column.maxValue;
      break;

    case 'float':
    case 'money':
    case 'percentage':
      base.type = 'number';
      if (column.minValue !== undefined) base.minimum = column.minValue;
      if (column.maxValue !== undefined) base.maximum = column.maxValue;
      break;

    case 'boolean':
      base.type = 'boolean';
      break;

    case 'date':
      base.type = 'string';
      base.format = 'date';
      break;

    case 'datetime':
      base.type = 'string';
      base.format = 'date-time';
      break;

    case 'uuid':
      base.type = 'string';
      base.format = 'uuid';
      break;

    default:
      base.type = 'string';
  }

  if (column.nullable) {
    base.type = [base.type as string, 'null'];
  }

  return base;
}

function generateMetadata(
  schema: DatasetSchema,
  data: GeneratedData,
  request: GenerationRequest,
  seed: number
): string {
  const metadata: DatasetMetadata = {
    generatedAt: new Date().toISOString(),
    generator: 'Synthetic Data Generator',
    version: '1.0.0',
    request: {
      description: request.description,
      rows: request.rows,
      format: request.format,
      seed,
      options: request.options,
    },
    schema: {
      tables: schema.tables.map(table => {
        const tableData = data.tables.get(table.name) || [];
        return {
          name: table.name,
          rowCount: tableData.length,
          columns: table.columns.map(col => ({
            name: col.name,
            type: col.type,
            nullCount: countNulls(tableData, col.name),
            uniqueCount: countUnique(tableData, col.name),
            distribution: col.distribution.type,
          })),
        };
      }),
    },
    statistics: {
      totalRows: data.statistics.totalRows,
      totalColumns: data.statistics.columnsGenerated,
      generationTimeMs: data.statistics.generationTimeMs,
    },
    warnings: generateWarnings(schema, data),
    syntheticDataNotice: 'This dataset is 100% synthetic and does not contain any real personal or sensitive information. It was generated using statistical distributions and is safe to use for development, testing, and demonstration purposes.',
  };

  return JSON.stringify(metadata, null, 2);
}

function countNulls(data: Record<string, unknown>[], column: string): number {
  return data.filter(row => row[column] === null || row[column] === undefined).length;
}

function countUnique(data: Record<string, unknown>[], column: string): number {
  const uniqueValues = new Set(data.map(row => JSON.stringify(row[column])));
  return uniqueValues.size;
}

function generateWarnings(schema: DatasetSchema, data: GeneratedData): string[] {
  const warnings: string[] = [];

  // Check for low cardinality in supposedly unique columns
  for (const table of schema.tables) {
    const tableData = data.tables.get(table.name) || [];
    for (const column of table.columns) {
      if (column.unique) {
        const uniqueCount = countUnique(tableData, column.name);
        if (uniqueCount < tableData.length) {
          warnings.push(`Column ${table.name}.${column.name} has duplicate values despite being marked as unique`);
        }
      }
    }
  }

  return warnings;
}

function generateReadme(
  schema: DatasetSchema,
  data: GeneratedData,
  request: GenerationRequest
): string {
  const tables = schema.tables.map(table => {
    const tableData = data.tables.get(table.name) || [];
    const columnDocs = table.columns.map(col => {
      let typeInfo = `\`${col.type}\``;
      if (col.nullable) typeInfo += ' (nullable)';
      if (col.unique) typeInfo += ' (unique)';
      return `| ${col.name} | ${typeInfo} | ${col.description} |`;
    }).join('\n');

    return `### ${table.name}

${table.description}

**Rows:** ${tableData.length.toLocaleString()}

| Column | Type | Description |
|--------|------|-------------|
${columnDocs}
`;
  }).join('\n');

  const relationships = schema.relationships.length > 0
    ? `## Relationships

${schema.relationships.map(rel =>
  `- \`${rel.from.table}.${rel.from.column}\` → \`${rel.to.table}.${rel.to.column}\` (${rel.type})`
).join('\n')}
`
    : '';

  const notes = schema.generationNotes.length > 0
    ? `## Generation Notes

${schema.generationNotes.map(note => `- ${note}`).join('\n')}
`
    : '';

  return `# ${schema.name}

${schema.description}

**Domain:** ${schema.domain}
**Total Rows:** ${data.statistics.totalRows.toLocaleString()}
**Format:** ${request.format.toUpperCase()}
**Generated:** ${new Date().toISOString()}

## SYNTHETIC DATA NOTICE

⚠️ **This dataset is 100% synthetic.** It was algorithmically generated and contains no real personal, financial, or sensitive information. It is safe to use for:

- Development and testing
- Machine learning experiments
- Demonstrations and presentations
- Educational purposes

Do not use this data as a substitute for real production data in systems that require accuracy.

## Tables

${tables}

${relationships}

${notes}

## Usage

### CSV
\`\`\`python
import pandas as pd
df = pd.read_csv('data.csv')
\`\`\`

### JSON
\`\`\`python
import json
with open('data.json') as f:
    data = json.load(f)
\`\`\`

### JavaScript
\`\`\`javascript
const data = require('./data.json');
// or
const response = await fetch('/api/download/data.json');
const data = await response.json();
\`\`\`

## Reproducibility

This dataset was generated with seed \`${request.seed || 'random'}\`.
To regenerate the exact same data, use the same seed value.

## License

This synthetic dataset is provided under the MIT License. You are free to use, modify, and distribute it for any purpose.

---

*Generated by Synthetic Data Generator v1.0.0*
`;
}
