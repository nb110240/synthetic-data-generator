# Synthetic Dataset Generator - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                         (Next.js + Tailwind)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ Description │  │  Parameters  │  │   Preview   │  │   Download   │  │
│  │    Input    │  │    Panel     │  │    View     │  │    Panel     │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                   │
│                         (Next.js API Routes)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │  /generate  │  │  /status/:id │  │ /download   │  │  /webhook    │  │
│  │   (POST)    │  │    (GET)     │  │    (GET)    │  │   (n8n)      │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GENERATION PIPELINE                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. INTENT PARSER                                                │   │
│  │     - Parse natural language description                         │   │
│  │     - Extract domain, entities, relationships                    │   │
│  │     - Identify dataset type (tabular, time-series, relational)  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2. SCHEMA PLANNER                                               │   │
│  │     - Design column schemas with types                           │   │
│  │     - Define constraints and valid ranges                        │   │
│  │     - Map relationships and foreign keys                         │   │
│  │     - Infer statistical distributions                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3. DATA GENERATOR                                               │   │
│  │     - Generate data using deterministic algorithms               │   │
│  │     - Apply distributions (normal, exponential, power-law)       │   │
│  │     - Enforce constraints and referential integrity              │   │
│  │     - Add controlled noise and edge cases                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  4. VALIDATOR                                                    │   │
│  │     - Check internal consistency                                 │   │
│  │     - Verify statistical properties                              │   │
│  │     - Validate referential integrity                             │   │
│  │     - Ensure no PII or real data leakage                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  5. OUTPUT FORMATTER                                             │   │
│  │     - Generate dataset file (CSV/JSON/Parquet)                   │   │
│  │     - Create JSON Schema                                         │   │
│  │     - Generate metadata                                          │   │
│  │     - Write documentation                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           FILE STORAGE                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  /tmp/datasets/{job_id}/                                         │   │
│  │    ├── data.csv / data.json / data.parquet                      │   │
│  │    ├── schema.json                                              │   │
│  │    ├── metadata.json                                            │   │
│  │    └── README.md                                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Separation of AI Planning and Deterministic Generation

**Problem with current n8n workflow:** LLM generates raw data directly, which is:
- Expensive (tokens per row)
- Slow (can't do 50k rows)
- Inconsistent (hard to enforce constraints)
- Non-reproducible

**Solution:** Use LLM only for schema planning, then generate data deterministically:
```
LLM (expensive, creative) → Schema + Distribution Plan → Generator (cheap, fast, consistent)
```

### 2. Multi-Stage Pipeline

Each stage has a single responsibility:
- **Intent Parser**: Understand what the user wants
- **Schema Planner**: Design how to generate it
- **Generator**: Actually create the data
- **Validator**: Ensure quality
- **Formatter**: Package for delivery

### 3. Distribution-Aware Generation

Instead of random values, we use realistic distributions:
- **Categorical**: Weighted sampling (e.g., 60% email, 30% phone, 10% chat)
- **Numeric**: Normal, exponential, power-law based on domain
- **Temporal**: Realistic patterns (business hours, seasonality)
- **Text**: Template-based with variation

### 4. Referential Integrity

For relational datasets:
- Generate parent entities first (customers)
- Create children with valid foreign keys (orders → customer_id)
- Maintain cardinality constraints (1:N, N:M)

### 5. Reproducibility via Seeding

All random operations use seeded RNG:
```typescript
const rng = seedrandom(userSeed || 'default');
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend | Next.js 14 (App Router) | Full-stack, excellent DX |
| UI | Tailwind + shadcn/ui | Clean, accessible components |
| API | Next.js API Routes | Unified deployment |
| LLM | OpenAI GPT-4 | Best schema inference |
| Generator | TypeScript + Faker.js | Fast, deterministic |
| Parquet | parquetjs | Native Node.js Parquet support |
| Queue | In-memory (upgradeable to Redis) | Simple to start |

## API Design

### POST /api/generate

Request:
```json
{
  "description": "E-commerce dataset with customers and orders",
  "rows": 10000,
  "format": "csv",
  "seed": 12345,
  "options": {
    "includeEdgeCases": true,
    "nullPercentage": 0.02,
    "referencedDatasets": ["kaggle-ecommerce"]
  }
}
```

Response:
```json
{
  "jobId": "uuid",
  "status": "processing",
  "estimatedTime": 15
}
```

### GET /api/status/:jobId

Response:
```json
{
  "jobId": "uuid",
  "status": "completed",
  "progress": 100,
  "files": {
    "data": "/api/download/uuid/data.csv",
    "schema": "/api/download/uuid/schema.json",
    "metadata": "/api/download/uuid/metadata.json",
    "readme": "/api/download/uuid/README.md"
  }
}
```

### POST /api/webhook (n8n Integration)

Same interface as /api/generate, but designed for n8n:
- Returns job ID immediately
- Can poll or use callback URL
- Supports webhook response when complete

## Improvement Over n8n-Only Workflow

| Aspect | Current n8n | Production Version |
|--------|-------------|-------------------|
| Max rows | ~100 (LLM limit) | 100k+ |
| Speed | 30s for 50 rows | 5s for 50k rows |
| Cost | $0.10 per 100 rows | $0.001 per 100 rows |
| Consistency | Variable | Guaranteed |
| Formats | JSON only | CSV, JSON, Parquet |
| Documentation | None | Full README + schema |
| Reproducibility | None | Seeded RNG |
| Validation | None | Multi-stage |

## Future SaaS Evolution

1. **Authentication**: Add Clerk/Auth.js
2. **Persistent Storage**: S3 + PostgreSQL
3. **Rate Limiting**: Redis-based
4. **Billing**: Stripe integration
5. **Templates**: Pre-built dataset templates
6. **API Keys**: For programmatic access
7. **Team Features**: Shared datasets
8. **Fine-tuning**: Custom domain models
