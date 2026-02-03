import { faker } from '@faker-js/faker';
import seedrandom from 'seedrandom';
import type {
  DatasetSchema,
  TableSchema,
  ColumnSchema,
  GeneratorContext,
  ColumnDistribution
} from './types';

type RNG = () => number;

export interface GeneratedData {
  tables: Map<string, Record<string, unknown>[]>;
  statistics: {
    totalRows: number;
    generationTimeMs: number;
    columnsGenerated: number;
  };
}

export async function generateData(
  schema: DatasetSchema,
  seed: number,
  nullPercentage: number = 0.02,
  includeEdgeCases: boolean = true,
  onProgress?: (progress: number, message: string) => void
): Promise<GeneratedData> {
  const startTime = Date.now();
  const rng = seedrandom(seed.toString());

  // Set faker seed
  faker.seed(seed);

  const context: GeneratorContext = {
    seed,
    rowCount: 0,
    nullPercentage,
    includeEdgeCases,
    generatedIds: new Map(),
  };

  const tables = new Map<string, Record<string, unknown>[]>();
  let columnsGenerated = 0;
  let totalRows = 0;

  // Sort tables by dependency order
  const orderedTables = sortTablesByDependency(schema);
  const totalTableRows = orderedTables.reduce((sum, t) => sum + t.rowCount, 0);
  let processedRows = 0;

  for (const tableSchema of orderedTables) {
    onProgress?.(
      Math.floor((processedRows / totalTableRows) * 100),
      `Generating ${tableSchema.name}...`
    );

    const tableData = await generateTable(tableSchema, tables, context, rng);
    tables.set(tableSchema.name, tableData);

    totalRows += tableData.length;
    columnsGenerated += tableSchema.columns.length;
    processedRows += tableData.length;
  }

  onProgress?.(100, 'Generation complete');

  return {
    tables,
    statistics: {
      totalRows,
      generationTimeMs: Date.now() - startTime,
      columnsGenerated,
    },
  };
}

function sortTablesByDependency(schema: DatasetSchema): TableSchema[] {
  const tables = [...schema.tables];
  const sorted: TableSchema[] = [];
  const remaining = new Set(tables.map(t => t.name));

  while (remaining.size > 0) {
    for (const table of tables) {
      if (!remaining.has(table.name)) continue;

      // Check if all foreign key dependencies are resolved
      const dependencies = table.columns
        .filter(c => c.foreignKey)
        .map(c => c.foreignKey!.table);

      const allDepsResolved = dependencies.every(
        dep => !remaining.has(dep) || dep === table.name
      );

      if (allDepsResolved) {
        sorted.push(table);
        remaining.delete(table.name);
      }
    }

    // Safety check to prevent infinite loop
    if (sorted.length === tables.length - remaining.size) {
      // Add any remaining tables (circular dependencies)
      for (const table of tables) {
        if (remaining.has(table.name)) {
          sorted.push(table);
          remaining.delete(table.name);
        }
      }
    }
  }

  return sorted;
}

async function generateTable(
  schema: TableSchema,
  generatedTables: Map<string, Record<string, unknown>[]>,
  context: GeneratorContext,
  rng: RNG
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const generatedValues = new Map<string, Set<unknown>>();

  // Initialize sets for unique columns
  for (const column of schema.columns) {
    if (column.unique) {
      generatedValues.set(column.name, new Set());
    }
  }

  // Generate rows in batches for memory efficiency
  const batchSize = 1000;
  for (let i = 0; i < schema.rowCount; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, schema.rowCount);

    for (let j = i; j < batchEnd; j++) {
      const row = generateRow(
        schema,
        j,
        generatedTables,
        generatedValues,
        context,
        rng
      );
      rows.push(row);
    }
  }

  // Store generated IDs for foreign key references
  const primaryKey = schema.primaryKey || schema.columns.find(c => c.unique)?.name;
  if (primaryKey) {
    const ids = new Set(rows.map(r => r[primaryKey]) as (string | number)[]);
    context.generatedIds.set(schema.name, ids);
  }

  return rows;
}

function generateRow(
  schema: TableSchema,
  rowIndex: number,
  generatedTables: Map<string, Record<string, unknown>[]>,
  generatedValues: Map<string, Set<unknown>>,
  context: GeneratorContext,
  rng: RNG
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  // First pass: generate independent columns
  for (const column of schema.columns) {
    if (column.derivedFrom) continue; // Handle derived columns in second pass

    let value = generateValue(
      column,
      rowIndex,
      generatedTables,
      context,
      rng
    );

    // Handle unique constraint
    if (column.unique) {
      const uniqueSet = generatedValues.get(column.name)!;
      let attempts = 0;
      while (uniqueSet.has(value) && attempts < 100) {
        value = generateValue(column, rowIndex + attempts * 1000, generatedTables, context, rng);
        attempts++;
      }
      uniqueSet.add(value);
    }

    // Apply null percentage
    if (column.nullable && rng() < context.nullPercentage) {
      value = null;
    }

    row[column.name] = value;
  }

  // Second pass: generate derived columns
  for (const column of schema.columns) {
    if (!column.derivedFrom) continue;

    row[column.name] = evaluateDerivedValue(column, row);
  }

  return row;
}

function generateValue(
  column: ColumnSchema,
  rowIndex: number,
  generatedTables: Map<string, Record<string, unknown>[]>,
  context: GeneratorContext,
  rng: RNG
): unknown {
  // Handle foreign keys
  if (column.foreignKey) {
    return generateForeignKey(column, generatedTables, context, rng);
  }

  // Generate based on distribution
  const distribution = column.distribution;

  switch (column.type) {
    case 'uuid':
      return faker.string.uuid();

    case 'string':
      return generateString(column, distribution, rng);

    case 'integer':
      return generateInteger(column, distribution, rng);

    case 'float':
    case 'percentage':
      return generateFloat(column, distribution, rng);

    case 'boolean':
      return generateBoolean(distribution, rng);

    case 'date':
      return generateDate(column, distribution, rng).toISOString().split('T')[0];

    case 'datetime':
      return generateDate(column, distribution, rng).toISOString();

    case 'email':
      return faker.internet.email().toLowerCase();

    case 'phone':
      return faker.phone.number();

    case 'url':
      return faker.internet.url();

    case 'address':
      return `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state()} ${faker.location.zipCode()}`;

    case 'name':
      return faker.person.firstName();

    case 'company':
      return faker.company.name();

    case 'money':
      return generateMoney(column, distribution, rng);

    default:
      return faker.lorem.word();
  }
}

function generateString(
  column: ColumnSchema,
  distribution: ColumnDistribution,
  rng: RNG
): string {
  // Handle enum values
  if (column.enumValues && column.enumValues.length > 0) {
    return sampleCategorical(column.enumValues, distribution, rng);
  }

  // Handle categorical distribution
  if (distribution.type === 'categorical' && distribution.params?.weights) {
    const weights = distribution.params.weights as Record<string, number>;
    return sampleWeighted(weights, rng);
  }

  // Generate based on column name heuristics
  const name = column.name.toLowerCase();
  if (name.includes('name')) return faker.person.fullName();
  if (name.includes('title')) return faker.lorem.sentence(3);
  if (name.includes('description')) return faker.lorem.paragraph();
  if (name.includes('city')) return faker.location.city();
  if (name.includes('country')) return faker.location.country();
  if (name.includes('state')) return faker.location.state();
  if (name.includes('address')) return faker.location.streetAddress();
  if (name.includes('status')) return faker.helpers.arrayElement(['active', 'inactive', 'pending']);
  if (name.includes('category')) return faker.commerce.department();
  if (name.includes('color')) return faker.color.human();
  if (name.includes('product')) return faker.commerce.productName();

  // Default string generation
  const minLen = column.minLength || 3;
  const maxLen = column.maxLength || 50;
  return faker.lorem.words(Math.ceil((minLen + maxLen) / 10));
}

function generateInteger(
  column: ColumnSchema,
  distribution: ColumnDistribution,
  rng: RNG
): number {
  const min = column.minValue ?? 0;
  const max = column.maxValue ?? 1000000;

  switch (distribution.type) {
    case 'normal': {
      const mean = (distribution.params?.mean as number) ?? (min + max) / 2;
      const stdDev = (distribution.params?.stdDev as number) ?? (max - min) / 6;
      return clamp(Math.round(normalRandom(rng, mean, stdDev)), min, max);
    }

    case 'exponential': {
      const lambda = (distribution.params?.lambda as number) ?? 0.1;
      const value = Math.round(-Math.log(1 - rng()) / lambda);
      return clamp(value + min, min, max);
    }

    case 'powerlaw': {
      const alpha = (distribution.params?.alpha as number) ?? 1.5;
      const value = Math.round(Math.pow(1 - rng(), -1 / (alpha - 1)));
      return clamp(value + min - 1, min, max);
    }

    case 'sequential':
      return (distribution.params?.start as number ?? 1) + column.minValue! || 0;

    default:
      return Math.floor(rng() * (max - min + 1)) + min;
  }
}

function generateFloat(
  column: ColumnSchema,
  distribution: ColumnDistribution,
  rng: RNG
): number {
  const min = column.minValue ?? 0;
  const max = column.maxValue ?? 1000;
  const decimals = column.type === 'percentage' ? 1 : 2;

  switch (distribution.type) {
    case 'normal': {
      const mean = (distribution.params?.mean as number) ?? (min + max) / 2;
      const stdDev = (distribution.params?.stdDev as number) ?? (max - min) / 6;
      return round(clamp(normalRandom(rng, mean, stdDev), min, max), decimals);
    }

    case 'exponential': {
      const lambda = (distribution.params?.lambda as number) ?? 0.1;
      const value = -Math.log(1 - rng()) / lambda;
      return round(clamp(value + min, min, max), decimals);
    }

    default:
      return round(rng() * (max - min) + min, decimals);
  }
}

function generateBoolean(distribution: ColumnDistribution, rng: RNG): boolean {
  if (distribution.type === 'categorical' && distribution.params?.weights) {
    const weights = distribution.params.weights as Record<string, number>;
    const trueWeight = weights['true'] ?? 0.5;
    return rng() < trueWeight;
  }
  return rng() < 0.5;
}

function generateDate(
  column: ColumnSchema,
  distribution: ColumnDistribution,
  rng: RNG
): Date {
  const now = new Date();
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);

  const range = now.getTime() - twoYearsAgo.getTime();
  const offset = Math.floor(rng() * range);

  return new Date(twoYearsAgo.getTime() + offset);
}

function generateMoney(
  column: ColumnSchema,
  distribution: ColumnDistribution,
  rng: RNG
): number {
  const min = column.minValue ?? 0.01;
  const max = column.maxValue ?? 10000;

  switch (distribution.type) {
    case 'exponential': {
      const lambda = (distribution.params?.lambda as number) ?? 0.01;
      const value = -Math.log(1 - rng()) / lambda;
      return round(clamp(value + min, min, max), 2);
    }

    case 'normal': {
      const mean = (distribution.params?.mean as number) ?? (min + max) / 2;
      const stdDev = (distribution.params?.stdDev as number) ?? (max - min) / 4;
      return round(clamp(normalRandom(rng, mean, stdDev), min, max), 2);
    }

    default:
      return round(rng() * (max - min) + min, 2);
  }
}

function generateForeignKey(
  column: ColumnSchema,
  generatedTables: Map<string, Record<string, unknown>[]>,
  context: GeneratorContext,
  rng: RNG
): unknown {
  const fk = column.foreignKey!;
  const referencedTable = generatedTables.get(fk.table);

  if (!referencedTable || referencedTable.length === 0) {
    // Table not generated yet, use cached IDs or generate placeholder
    const cachedIds = context.generatedIds.get(fk.table);
    if (cachedIds && cachedIds.size > 0) {
      const ids = Array.from(cachedIds);

      // Apply distribution to foreign key selection
      if (column.distribution.type === 'powerlaw') {
        // Power law: some referenced records appear much more often
        const alpha = (column.distribution.params?.alpha as number) ?? 1.5;
        const index = Math.min(
          Math.floor(Math.pow(rng(), alpha) * ids.length),
          ids.length - 1
        );
        return ids[index];
      }

      return ids[Math.floor(rng() * ids.length)];
    }
    return faker.string.uuid();
  }

  // Apply distribution to foreign key selection
  if (column.distribution.type === 'powerlaw') {
    const alpha = (column.distribution.params?.alpha as number) ?? 1.5;
    const index = Math.min(
      Math.floor(Math.pow(rng(), alpha) * referencedTable.length),
      referencedTable.length - 1
    );
    return referencedTable[index][fk.column];
  }

  const randomIndex = Math.floor(rng() * referencedTable.length);
  return referencedTable[randomIndex][fk.column];
}

function evaluateDerivedValue(
  column: ColumnSchema,
  row: Record<string, unknown>
): unknown {
  const derivation = column.derivedFrom;
  if (!derivation || !derivation.formula) {
    return null;
  }
  const formula = derivation.formula.toLowerCase();

  // Simple formula evaluation
  if (formula.includes('*')) {
    const parts = formula.split('*').map(p => p.trim());
    let result = 1;
    for (const part of parts) {
      const value = row[part];
      if (typeof value === 'number') {
        result *= value;
      }
    }
    return round(result, 2);
  }

  if (formula.includes('+')) {
    const parts = formula.split('+').map(p => p.trim());
    let result = 0;
    for (const part of parts) {
      const value = row[part];
      if (typeof value === 'number') {
        result += value;
      }
    }
    return round(result, 2);
  }

  return null;
}

// Utility functions

function sampleCategorical(
  values: string[],
  distribution: ColumnDistribution,
  rng: RNG
): string {
  if (distribution.type === 'categorical' && distribution.params?.weights) {
    const weights = distribution.params.weights as Record<string, number>;
    return sampleWeighted(weights, rng);
  }
  return values[Math.floor(rng() * values.length)];
}

function sampleWeighted(weights: Record<string, number>, rng: RNG): string {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let random = rng() * totalWeight;

  for (const [value, weight] of entries) {
    random -= weight;
    if (random <= 0) {
      return value;
    }
  }

  return entries[entries.length - 1][0];
}

function normalRandom(rng: RNG, mean: number, stdDev: number): number {
  // Box-Muller transform
  const u1 = rng();
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z0 * stdDev + mean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
