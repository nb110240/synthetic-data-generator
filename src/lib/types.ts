import { z } from 'zod';

// ============================================================================
// Request/Response Types
// ============================================================================

export const GenerationRequestSchema = z.object({
  description: z.string().min(10).max(5000),
  rows: z.number().int().min(1).max(1000000).default(1000),
  format: z.enum(['csv', 'json', 'parquet']).default('csv'),
  seed: z.number().int().optional(),
  options: z.object({
    includeEdgeCases: z.boolean().default(true),
    nullPercentage: z.number().min(0).max(0.5).default(0.02),
    privacyLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  }).optional(),
});

export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;

export interface GenerationJob {
  id: string;
  status: 'queued' | 'planning' | 'generating' | 'validating' | 'completed' | 'failed';
  progress: number;
  request: GenerationRequest;
  schema?: DatasetSchema;
  files?: GeneratedFiles;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface GeneratedFiles {
  data: string;
  schema: string;
  metadata: string;
  readme: string;
}

// ============================================================================
// Schema Types (LLM Output)
// ============================================================================

export type ColumnType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'uuid'
  | 'url'
  | 'address'
  | 'name'
  | 'company'
  | 'money'
  | 'percentage';

export type DistributionType =
  | 'uniform'
  | 'normal'
  | 'exponential'
  | 'powerlaw'
  | 'categorical'
  | 'sequential';

export interface ColumnDistribution {
  type: DistributionType;
  // For normal: mean, stdDev
  // For exponential: lambda
  // For powerlaw: alpha
  // For categorical: weights
  params?: Record<string, number | string[] | Record<string, number>>;
}

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  description: string;
  nullable: boolean;
  unique: boolean;
  distribution: ColumnDistribution;
  // Constraints
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enumValues?: string[];
  // For foreign keys
  foreignKey?: {
    table: string;
    column: string;
  };
  // Correlations
  correlatedWith?: {
    column: string;
    correlation: number; // -1 to 1
  };
  // Derived columns
  derivedFrom?: {
    formula: string;
    columns: string[];
  };
}

export interface TableSchema {
  name: string;
  description: string;
  columns: ColumnSchema[];
  rowCount: number;
  primaryKey?: string;
}

export interface DatasetSchema {
  name: string;
  description: string;
  domain: string;
  tables: TableSchema[];
  relationships: Relationship[];
  generationNotes: string[];
}

export interface Relationship {
  from: { table: string; column: string };
  to: { table: string; column: string };
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

// ============================================================================
// Metadata Types
// ============================================================================

export interface DatasetMetadata {
  generatedAt: string;
  generator: string;
  version: string;
  request: {
    description: string;
    rows: number;
    format: string;
    seed: number;
    options: GenerationRequest['options'];
  };
  schema: {
    tables: Array<{
      name: string;
      rowCount: number;
      columns: Array<{
        name: string;
        type: string;
        nullCount: number;
        uniqueCount: number;
        distribution: string;
      }>;
    }>;
  };
  statistics: {
    totalRows: number;
    totalColumns: number;
    generationTimeMs: number;
  };
  warnings: string[];
  syntheticDataNotice: string;
}

// ============================================================================
// Internal Pipeline Types
// ============================================================================

export interface ParsedIntent {
  domain: string;
  entities: string[];
  relationships: string[];
  specialRequirements: string[];
  dataCharacteristics: {
    hasTimeSeries: boolean;
    hasHierarchy: boolean;
    hasGeospatial: boolean;
    expectedDistributions: string[];
  };
}

export interface GeneratorContext {
  seed: number;
  rowCount: number;
  nullPercentage: number;
  includeEdgeCases: boolean;
  generatedIds: Map<string, Set<string | number>>;
}
