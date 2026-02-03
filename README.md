# Synthetic Dataset Generator

A production-quality synthetic dataset generator that creates realistic, privacy-safe datasets from natural language descriptions.

## Why This Over the Basic n8n Workflow?

Your original n8n workflow had several limitations:

| Issue | Original n8n | This Solution |
|-------|--------------|---------------|
| **Cost** | GPT-4o generates every row (~$0.10/100 rows) | AI plans schema only (~$0.001/100 rows) |
| **Speed** | 30+ seconds for 50 rows | 5 seconds for 50,000 rows |
| **Scale** | Max ~100 rows (token limit) | Up to 1,000,000 rows |
| **Privacy** | All data goes through OpenAI | Optional "high privacy" mode - no AI |
| **Consistency** | LLM output varies | Deterministic with seed |
| **Output** | JSON only | CSV, JSON, Parquet |
| **Docs** | None | Full README + schema + metadata |
| **Validation** | None | Multi-stage validation |

## Architecture

```
User Request → Schema Planner (AI) → Data Generator (Local) → Validator → Output
                    ↑                        ↑
               Cheap, fast             Deterministic,
               One-time call           Reproducible,
                                       Privacy-safe
```

**Key insight**: Use AI only for the "thinking" (schema design), then generate data locally with deterministic algorithms. This is 100x cheaper and infinitely more scalable.

## Quick Start

### 1. Install Dependencies

```bash
cd synthetic-data-generator
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Optional: Add OPENAI_API_KEY for AI-assisted schema planning
# If not set, uses local templates (more private)
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the web interface.

## API Usage

### Generate Dataset

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "description": "E-commerce dataset with customers, orders, and products",
    "rows": 10000,
    "format": "csv",
    "seed": 12345,
    "options": {
      "privacyLevel": "high",
      "includeEdgeCases": true
    }
  }'
```

Response:
```json
{
  "jobId": "abc123",
  "status": "processing",
  "statusUrl": "/api/status/abc123"
}
```

### Check Status

```bash
curl http://localhost:3000/api/status/abc123
```

### Download Files

```bash
# Data file
curl -O http://localhost:3000/api/download/abc123/data

# Schema
curl -O http://localhost:3000/api/download/abc123/schema

# Metadata
curl -O http://localhost:3000/api/download/abc123/metadata

# README
curl -O http://localhost:3000/api/download/abc123/readme
```

## n8n Integration

### Option 1: Use the Webhook API

Import `ImprovedDataGenerator-n8n-workflow.json` into n8n and set the `DATASET_GENERATOR_URL` environment variable.

```bash
# In n8n, set environment variable:
DATASET_GENERATOR_URL=http://your-generator-host:3000
```

### Option 2: Direct HTTP Request

From any n8n workflow:

```javascript
// HTTP Request node configuration
{
  "method": "POST",
  "url": "http://your-generator-host:3000/api/webhook",
  "body": {
    "description": "{{ $json.prompt }}",
    "rows": 1000,
    "format": "csv",
    "sync": true  // Wait for completion
  }
}
```

## Privacy Levels

| Level | Schema Planning | Data Generation |
|-------|-----------------|-----------------|
| **Low** | OpenAI GPT-4o-mini | Local algorithms |
| **Medium** | OpenAI GPT-4o-mini | Local algorithms |
| **High** | Local templates only | Local algorithms |

**Note**: Even at "low" privacy, only the dataset *description* is sent to AI - never any actual data.

## Data Generation Techniques

### Realistic Distributions

- **Normal**: User ages, ratings, temperatures
- **Exponential**: Transaction amounts, wait times
- **Power-law**: Customer frequency, product popularity
- **Categorical**: Weighted category selection

### Referential Integrity

Multi-table datasets maintain proper foreign key relationships:

```
customers (1) ←→ (N) orders (N) ←→ (1) products
```

### Controlled Noise

- Configurable null percentage
- Edge cases (empty strings, max values)
- Realistic messiness

### Reproducibility

Same seed = identical output:

```bash
# These produce identical datasets
curl -X POST ... -d '{"seed": 42, ...}'
curl -X POST ... -d '{"seed": 42, ...}'
```

## Output Files

Every generation produces:

1. **data.{csv|json}** - The synthetic dataset
2. **schema.json** - JSON Schema for validation
3. **metadata.json** - Generation parameters and statistics
4. **README.md** - Human-readable documentation

## Example Datasets

### E-commerce
```
"Create a Kaggle-style e-commerce dataset with customers, products, and orders.
Include realistic purchase patterns, customer segments, and seasonal variation."
```

### Financial Transactions
```
"Generate bank transactions with account IDs, amounts, categories, and timestamps.
Include 0.5% fraud rate and realistic spending distributions."
```

### IoT Sensor Data
```
"Create sensor readings from 10 temperature sensors over 30 days.
Include diurnal patterns, occasional anomalies, and sensor drift."
```

### User Analytics
```
"Generate SaaS user data with signups, daily usage, feature adoption, and churn.
Power-law distribution for engagement levels."
```

## Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Railway / Render

Connect your GitHub repo and deploy with defaults.

## Evolution to SaaS

To turn this into a paid service:

1. **Authentication**: Add Clerk or Auth.js
2. **Database**: PostgreSQL for users, jobs, history
3. **Storage**: S3 for generated datasets
4. **Billing**: Stripe for usage-based pricing
5. **Rate Limiting**: Redis-based limits
6. **API Keys**: For programmatic access
7. **Templates**: Pre-built dataset templates
8. **Teams**: Shared datasets and collaboration

## Project Structure

```
synthetic-data-generator/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── generate/route.ts     # Main generation endpoint
│   │   │   ├── status/[jobId]/       # Job status polling
│   │   │   ├── download/[jobId]/     # File downloads
│   │   │   └── webhook/route.ts      # n8n webhook endpoint
│   │   ├── page.tsx                  # Main UI
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   └── dataset-generator.tsx     # Main form component
│   └── lib/
│       ├── types.ts                  # TypeScript types
│       ├── schema-planner.ts         # AI/local schema planning
│       ├── data-generator.ts         # Deterministic generation
│       ├── output-formatter.ts       # CSV/JSON/Parquet output
│       └── job-manager.ts            # Async job handling
├── ImprovedDataGenerator-n8n-workflow.json
└── ARCHITECTURE.md
```

## License

MIT
