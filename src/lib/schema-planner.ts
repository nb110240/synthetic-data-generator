import OpenAI from 'openai';
import type { DatasetSchema, GenerationRequest } from './types';

const SCHEMA_PLANNER_PROMPT = `You are an expert data architect specializing in synthetic dataset design.

Your task: Given a natural language description of a dataset, design a complete schema for generating realistic synthetic data.

IMPORTANT GUIDELINES:
1. Design schemas that produce REALISTIC data - not random noise
2. Use appropriate data types and distributions for each column
3. Include realistic constraints (min/max values, patterns)
4. Define relationships between tables when applicable
5. Consider domain-specific patterns (e.g., e-commerce has seasonal patterns)
6. Add correlations between related columns (e.g., price × quantity = total)

OUTPUT FORMAT (JSON):
{
  "name": "dataset_name",
  "description": "What this dataset represents",
  "domain": "e.g., e-commerce, healthcare, finance",
  "tables": [
    {
      "name": "table_name",
      "description": "What this table represents",
      "primaryKey": "id_column",
      "rowCount": 1000,
      "columns": [
        {
          "name": "column_name",
          "type": "string|integer|float|boolean|date|datetime|email|phone|uuid|url|address|name|company|money|percentage",
          "description": "What this column represents",
          "nullable": false,
          "unique": false,
          "distribution": {
            "type": "uniform|normal|exponential|powerlaw|categorical|sequential",
            "params": {}
          },
          "minValue": null,
          "maxValue": null,
          "enumValues": null,
          "foreignKey": null,
          "correlatedWith": null,
          "derivedFrom": null
        }
      ]
    }
  ],
  "relationships": [
    {
      "from": {"table": "orders", "column": "customer_id"},
      "to": {"table": "customers", "column": "id"},
      "type": "one-to-many"
    }
  ],
  "generationNotes": ["Important notes about how to generate this data realistically"]
}

DISTRIBUTION TYPES:
- uniform: Equal probability for all values
- normal: Bell curve, specify mean and stdDev
- exponential: Long tail, specify lambda (rate)
- powerlaw: Heavy tail (80/20 rule), specify alpha
- categorical: Weighted categories, specify weights object
- sequential: Auto-incrementing values

EXAMPLE DISTRIBUTIONS:
- Order amounts: {"type": "exponential", "params": {"lambda": 0.01}}
- Product ratings: {"type": "normal", "params": {"mean": 3.8, "stdDev": 1.2}}
- Customer segments: {"type": "categorical", "params": {"weights": {"premium": 0.2, "standard": 0.6, "basic": 0.2}}}
- User IDs: {"type": "sequential", "params": {"start": 1}}

Return ONLY valid JSON, no markdown formatting.`;

export async function planSchema(
  request: GenerationRequest,
  apiKey?: string
): Promise<DatasetSchema> {
  // Use local planning if no API key, placeholder key, or if privacy is high
  const isPlaceholderKey = !apiKey || apiKey === 'your-key-here' || apiKey.length < 20;

  if (isPlaceholderKey || request.options?.privacyLevel === 'high') {
    console.log('Using local schema planning (no valid API key or high privacy mode)');
    return planSchemaLocally(request);
  }

  const openai = new OpenAI({ apiKey });

  const userPrompt = `Dataset Description: ${request.description}

Requested rows: ${request.rows}
Output format: ${request.format}

Design a complete schema for generating this synthetic dataset.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cheap model - only used for schema planning
      messages: [
        { role: 'system', content: SCHEMA_PLANNER_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from schema planner');
    }

    // Parse JSON response - handle markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const schema = JSON.parse(jsonContent) as DatasetSchema;

    // Distribute rows across tables
    distributeRowCounts(schema, request.rows);

    return schema;
  } catch (error) {
    console.error('Schema planning failed, falling back to local planning:', error);
    return planSchemaLocally(request);
  }
}

function distributeRowCounts(schema: DatasetSchema, totalRows: number): void {
  if (schema.tables.length === 1) {
    schema.tables[0].rowCount = totalRows;
    return;
  }

  // For multi-table datasets, distribute based on relationships
  // Main table gets full count, child tables get multiplied count
  const mainTable = schema.tables[0];
  mainTable.rowCount = totalRows;

  for (let i = 1; i < schema.tables.length; i++) {
    const table = schema.tables[i];
    const relationship = schema.relationships.find(
      (r) => r.from.table === table.name || r.to.table === table.name
    );

    if (relationship?.type === 'one-to-many') {
      // Child table has ~3x rows of parent
      table.rowCount = Math.floor(totalRows * 3);
    } else if (relationship?.type === 'many-to-many') {
      // Junction table has ~5x rows
      table.rowCount = Math.floor(totalRows * 5);
    } else {
      // Default to same count
      table.rowCount = totalRows;
    }
  }
}

// Local schema planning for privacy-first mode or fallback
function planSchemaLocally(request: GenerationRequest): DatasetSchema {
  const description = request.description.toLowerCase();

  // Detect domain from description
  const domain = detectDomain(description);

  // Generate appropriate schema based on domain
  switch (domain) {
    case 'ecommerce':
      return generateEcommerceSchema(request);
    case 'users':
      return generateUsersSchema(request);
    case 'timeseries':
      return generateTimeseriesSchema(request);
    case 'financial':
      return generateFinancialSchema(request);
    case 'healthcare':
      return generateHealthcareSchema(request);
    case 'hr':
      return generateHRSchema(request);
    case 'social':
      return generateSocialMediaSchema(request);
    default:
      return generateGenericSchema(request);
  }
}

function detectDomain(description: string): string {
  if (/ecommerce|order|product|customer|shop|purchase|cart/i.test(description)) {
    return 'ecommerce';
  }
  if (/user|account|profile|registration|login/i.test(description)) {
    return 'users';
  }
  if (/time.?series|sensor|metric|log|event|stream/i.test(description)) {
    return 'timeseries';
  }
  if (/financial|stock|trade|transaction|bank|payment/i.test(description)) {
    return 'financial';
  }
  if (/healthcare|patient|medical|hospital|diagnosis|treatment|doctor/i.test(description)) {
    return 'healthcare';
  }
  if (/hr|employee|salary|department|hiring|workforce/i.test(description)) {
    return 'hr';
  }
  if (/social|post|comment|like|follower|tweet|feed/i.test(description)) {
    return 'social';
  }
  return 'generic';
}

function generateEcommerceSchema(request: GenerationRequest): DatasetSchema {
  const rows = request.rows;
  const customerCount = Math.max(100, Math.floor(rows / 3));
  const productCount = Math.max(50, Math.floor(rows / 10));

  return {
    name: 'ecommerce_dataset',
    description: 'Synthetic e-commerce dataset with customers, products, and orders',
    domain: 'e-commerce',
    tables: [
      {
        name: 'customers',
        description: 'Customer information',
        primaryKey: 'customer_id',
        rowCount: customerCount,
        columns: [
          { name: 'customer_id', type: 'uuid', description: 'Unique customer identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'first_name', type: 'name', description: 'Customer first name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'last_name', type: 'name', description: 'Customer last name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'email', type: 'email', description: 'Customer email address', nullable: false, unique: true, distribution: { type: 'uniform' } },
          { name: 'phone', type: 'phone', description: 'Customer phone number', nullable: true, unique: false, distribution: { type: 'uniform' } },
          { name: 'city', type: 'string', description: 'Customer city', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'New York': 0.15, 'Los Angeles': 0.12, 'Chicago': 0.08, 'Houston': 0.07, 'Phoenix': 0.05, 'Other': 0.53 } } } },
          { name: 'customer_segment', type: 'string', description: 'Customer segment', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'Premium': 0.15, 'Standard': 0.65, 'Budget': 0.20 } } }, enumValues: ['Premium', 'Standard', 'Budget'] },
          { name: 'created_at', type: 'datetime', description: 'Account creation date', nullable: false, unique: false, distribution: { type: 'uniform' } },
        ],
      },
      {
        name: 'products',
        description: 'Product catalog',
        primaryKey: 'product_id',
        rowCount: productCount,
        columns: [
          { name: 'product_id', type: 'uuid', description: 'Unique product identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'product_name', type: 'string', description: 'Product name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'category', type: 'string', description: 'Product category', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'Electronics': 0.25, 'Clothing': 0.20, 'Home & Garden': 0.15, 'Sports': 0.10, 'Books': 0.10, 'Toys': 0.10, 'Other': 0.10 } } } },
          { name: 'price', type: 'money', description: 'Product price', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.02 } }, minValue: 5, maxValue: 2000 },
          { name: 'rating', type: 'float', description: 'Average product rating', nullable: true, unique: false, distribution: { type: 'normal', params: { mean: 4.0, stdDev: 0.8 } }, minValue: 1, maxValue: 5 },
          { name: 'stock_quantity', type: 'integer', description: 'Current stock level', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.01 } }, minValue: 0, maxValue: 10000 },
        ],
      },
      {
        name: 'orders',
        description: 'Customer orders',
        primaryKey: 'order_id',
        rowCount: rows,
        columns: [
          { name: 'order_id', type: 'uuid', description: 'Unique order identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'customer_id', type: 'uuid', description: 'Customer who placed the order', nullable: false, unique: false, distribution: { type: 'powerlaw', params: { alpha: 1.5 } }, foreignKey: { table: 'customers', column: 'customer_id' } },
          { name: 'product_id', type: 'uuid', description: 'Product ordered', nullable: false, unique: false, distribution: { type: 'powerlaw', params: { alpha: 1.2 } }, foreignKey: { table: 'products', column: 'product_id' } },
          { name: 'quantity', type: 'integer', description: 'Quantity ordered', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.5 } }, minValue: 1, maxValue: 20 },
          { name: 'unit_price', type: 'money', description: 'Price per unit at time of order', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'total_amount', type: 'money', description: 'Total order amount', nullable: false, unique: false, distribution: { type: 'uniform' }, derivedFrom: { formula: 'quantity * unit_price', columns: ['quantity', 'unit_price'] } },
          { name: 'order_date', type: 'datetime', description: 'Date and time of order', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'status', type: 'string', description: 'Order status', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'Delivered': 0.70, 'Shipped': 0.15, 'Processing': 0.10, 'Cancelled': 0.05 } } }, enumValues: ['Delivered', 'Shipped', 'Processing', 'Cancelled'] },
        ],
      },
    ],
    relationships: [
      { from: { table: 'orders', column: 'customer_id' }, to: { table: 'customers', column: 'customer_id' }, type: 'one-to-many' },
      { from: { table: 'orders', column: 'product_id' }, to: { table: 'products', column: 'product_id' }, type: 'one-to-many' },
    ],
    generationNotes: [
      'Customer purchase frequency follows power law (some customers buy frequently)',
      'Product popularity follows power law (some products sell more)',
      'Order amounts have realistic exponential distribution',
      'Seasonal patterns can be added to order_date',
    ],
  };
}

function generateUsersSchema(request: GenerationRequest): DatasetSchema {
  return {
    name: 'users_dataset',
    description: 'Synthetic user accounts dataset',
    domain: 'users',
    tables: [
      {
        name: 'users',
        description: 'User account information',
        primaryKey: 'user_id',
        rowCount: request.rows,
        columns: [
          { name: 'user_id', type: 'uuid', description: 'Unique user identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'username', type: 'string', description: 'Unique username', nullable: false, unique: true, distribution: { type: 'uniform' }, minLength: 3, maxLength: 20 },
          { name: 'email', type: 'email', description: 'User email address', nullable: false, unique: true, distribution: { type: 'uniform' } },
          { name: 'first_name', type: 'name', description: 'User first name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'last_name', type: 'name', description: 'User last name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'age', type: 'integer', description: 'User age', nullable: true, unique: false, distribution: { type: 'normal', params: { mean: 32, stdDev: 12 } }, minValue: 18, maxValue: 80 },
          { name: 'country', type: 'string', description: 'User country', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'United States': 0.35, 'United Kingdom': 0.15, 'Germany': 0.10, 'France': 0.08, 'Canada': 0.07, 'Australia': 0.05, 'Other': 0.20 } } } },
          { name: 'is_verified', type: 'boolean', description: 'Email verification status', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'true': 0.85, 'false': 0.15 } } } },
          { name: 'created_at', type: 'datetime', description: 'Account creation timestamp', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'last_login', type: 'datetime', description: 'Last login timestamp', nullable: true, unique: false, distribution: { type: 'uniform' } },
        ],
      },
    ],
    relationships: [],
    generationNotes: ['Age follows normal distribution centered around 32', 'Most users are verified (85%)'],
  };
}

function generateTimeseriesSchema(request: GenerationRequest): DatasetSchema {
  return {
    name: 'timeseries_dataset',
    description: 'Synthetic time series sensor data',
    domain: 'iot',
    tables: [
      {
        name: 'sensor_readings',
        description: 'Sensor measurement readings',
        primaryKey: 'reading_id',
        rowCount: request.rows,
        columns: [
          { name: 'reading_id', type: 'uuid', description: 'Unique reading identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'sensor_id', type: 'string', description: 'Sensor identifier', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: {} } }, enumValues: Array.from({ length: 10 }, (_, i) => `sensor_${i + 1}`) },
          { name: 'timestamp', type: 'datetime', description: 'Reading timestamp', nullable: false, unique: false, distribution: { type: 'sequential' } },
          { name: 'temperature', type: 'float', description: 'Temperature reading in Celsius', nullable: false, unique: false, distribution: { type: 'normal', params: { mean: 22, stdDev: 5 } }, minValue: -10, maxValue: 50 },
          { name: 'humidity', type: 'float', description: 'Humidity percentage', nullable: false, unique: false, distribution: { type: 'normal', params: { mean: 60, stdDev: 15 } }, minValue: 0, maxValue: 100 },
          { name: 'pressure', type: 'float', description: 'Atmospheric pressure in hPa', nullable: false, unique: false, distribution: { type: 'normal', params: { mean: 1013, stdDev: 20 } }, minValue: 950, maxValue: 1050 },
          { name: 'battery_level', type: 'percentage', description: 'Sensor battery level', nullable: false, unique: false, distribution: { type: 'uniform' }, minValue: 0, maxValue: 100 },
          { name: 'status', type: 'string', description: 'Sensor status', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'normal': 0.95, 'warning': 0.04, 'error': 0.01 } } }, enumValues: ['normal', 'warning', 'error'] },
        ],
      },
    ],
    relationships: [],
    generationNotes: ['Timestamps are sequential with realistic intervals', 'Temperature and humidity may be correlated'],
  };
}

function generateFinancialSchema(request: GenerationRequest): DatasetSchema {
  return {
    name: 'financial_transactions',
    description: 'Synthetic financial transaction data',
    domain: 'finance',
    tables: [
      {
        name: 'transactions',
        description: 'Financial transactions',
        primaryKey: 'transaction_id',
        rowCount: request.rows,
        columns: [
          { name: 'transaction_id', type: 'uuid', description: 'Unique transaction identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'account_id', type: 'string', description: 'Account identifier', nullable: false, unique: false, distribution: { type: 'powerlaw', params: { alpha: 1.5 } } },
          { name: 'transaction_date', type: 'datetime', description: 'Transaction timestamp', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'amount', type: 'money', description: 'Transaction amount', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.01 } }, minValue: 0.01, maxValue: 50000 },
          { name: 'transaction_type', type: 'string', description: 'Type of transaction', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'debit': 0.55, 'credit': 0.40, 'transfer': 0.05 } } }, enumValues: ['debit', 'credit', 'transfer'] },
          { name: 'category', type: 'string', description: 'Transaction category', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'groceries': 0.20, 'utilities': 0.15, 'entertainment': 0.12, 'transportation': 0.10, 'restaurants': 0.10, 'shopping': 0.10, 'healthcare': 0.08, 'other': 0.15 } } } },
          { name: 'merchant', type: 'company', description: 'Merchant name', nullable: true, unique: false, distribution: { type: 'uniform' } },
          { name: 'balance_after', type: 'money', description: 'Account balance after transaction', nullable: false, unique: false, distribution: { type: 'normal', params: { mean: 5000, stdDev: 3000 } }, minValue: 0 },
          { name: 'is_fraudulent', type: 'boolean', description: 'Fraud flag', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'false': 0.995, 'true': 0.005 } } } },
        ],
      },
    ],
    relationships: [],
    generationNotes: ['Transaction amounts follow exponential distribution', 'Fraud rate is realistically low (0.5%)', 'Account activity follows power law'],
  };
}

function generateGenericSchema(request: GenerationRequest): DatasetSchema {
  return {
    name: 'generic_dataset',
    description: request.description,
    domain: 'general',
    tables: [
      {
        name: 'data',
        description: 'Main data table',
        primaryKey: 'id',
        rowCount: request.rows,
        columns: [
          { name: 'id', type: 'uuid', description: 'Unique identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'name', type: 'string', description: 'Name field', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'description', type: 'string', description: 'Description field', nullable: true, unique: false, distribution: { type: 'uniform' } },
          { name: 'value', type: 'float', description: 'Numeric value', nullable: false, unique: false, distribution: { type: 'normal', params: { mean: 100, stdDev: 30 } } },
          { name: 'category', type: 'string', description: 'Category field', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'A': 0.3, 'B': 0.3, 'C': 0.25, 'D': 0.15 } } } },
          { name: 'is_active', type: 'boolean', description: 'Active status', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'true': 0.8, 'false': 0.2 } } } },
          { name: 'created_at', type: 'datetime', description: 'Creation timestamp', nullable: false, unique: false, distribution: { type: 'uniform' } },
        ],
      },
    ],
    relationships: [],
    generationNotes: ['Generic dataset with common column types'],
  };
}

// Healthcare dataset schema
function generateHealthcareSchema(request: GenerationRequest): DatasetSchema {
  const patientCount = Math.max(100, Math.floor(request.rows / 3));

  return {
    name: 'healthcare_dataset',
    description: 'Synthetic healthcare data with patients and medical records',
    domain: 'healthcare',
    tables: [
      {
        name: 'patients',
        description: 'Patient demographic information',
        primaryKey: 'patient_id',
        rowCount: patientCount,
        columns: [
          { name: 'patient_id', type: 'uuid', description: 'Unique patient identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'first_name', type: 'name', description: 'Patient first name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'last_name', type: 'name', description: 'Patient last name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'date_of_birth', type: 'date', description: 'Date of birth', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'gender', type: 'string', description: 'Patient gender', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'Male': 0.48, 'Female': 0.50, 'Other': 0.02 } } }, enumValues: ['Male', 'Female', 'Other'] },
          { name: 'blood_type', type: 'string', description: 'Blood type', nullable: true, unique: false, distribution: { type: 'categorical', params: { weights: { 'O+': 0.37, 'A+': 0.36, 'B+': 0.08, 'AB+': 0.03, 'O-': 0.07, 'A-': 0.06, 'B-': 0.02, 'AB-': 0.01 } } } },
          { name: 'insurance_provider', type: 'string', description: 'Insurance provider', nullable: true, unique: false, distribution: { type: 'categorical', params: { weights: { 'BlueCross': 0.25, 'Aetna': 0.20, 'UnitedHealth': 0.20, 'Cigna': 0.15, 'Medicare': 0.10, 'Uninsured': 0.10 } } } },
          { name: 'created_at', type: 'datetime', description: 'Record creation date', nullable: false, unique: false, distribution: { type: 'uniform' } },
        ],
      },
      {
        name: 'medical_records',
        description: 'Patient medical visits and diagnoses',
        primaryKey: 'record_id',
        rowCount: request.rows,
        columns: [
          { name: 'record_id', type: 'uuid', description: 'Unique record identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'patient_id', type: 'uuid', description: 'Patient reference', nullable: false, unique: false, distribution: { type: 'powerlaw', params: { alpha: 1.3 } }, foreignKey: { table: 'patients', column: 'patient_id' } },
          { name: 'visit_date', type: 'datetime', description: 'Date of visit', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'diagnosis_code', type: 'string', description: 'ICD-10 diagnosis code', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'J06.9': 0.15, 'I10': 0.12, 'E11.9': 0.10, 'M54.5': 0.08, 'J20.9': 0.07, 'K21.0': 0.06, 'F41.1': 0.05, 'Other': 0.37 } } } },
          { name: 'diagnosis_description', type: 'string', description: 'Diagnosis description', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'treatment', type: 'string', description: 'Prescribed treatment', nullable: true, unique: false, distribution: { type: 'uniform' } },
          { name: 'cost', type: 'money', description: 'Visit cost', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.005 } }, minValue: 50, maxValue: 10000 },
          { name: 'follow_up_required', type: 'boolean', description: 'Follow-up needed', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'true': 0.35, 'false': 0.65 } } } },
        ],
      },
    ],
    relationships: [
      { from: { table: 'medical_records', column: 'patient_id' }, to: { table: 'patients', column: 'patient_id' }, type: 'one-to-many' },
    ],
    generationNotes: ['Some patients have many visits (power law)', 'Diagnosis codes follow realistic ICD-10 distribution', 'Costs follow exponential distribution'],
  };
}

// HR/Employee dataset schema
function generateHRSchema(request: GenerationRequest): DatasetSchema {
  const departmentCount = 10;
  const employeeCount = request.rows;

  return {
    name: 'hr_dataset',
    description: 'Synthetic HR data with employees and departments',
    domain: 'hr',
    tables: [
      {
        name: 'departments',
        description: 'Company departments',
        primaryKey: 'department_id',
        rowCount: departmentCount,
        columns: [
          { name: 'department_id', type: 'uuid', description: 'Unique department identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'department_name', type: 'string', description: 'Department name', nullable: false, unique: true, distribution: { type: 'categorical', params: { weights: { 'Engineering': 0.2, 'Sales': 0.15, 'Marketing': 0.12, 'Finance': 0.10, 'HR': 0.08, 'Operations': 0.10, 'Product': 0.10, 'Legal': 0.05, 'Support': 0.05, 'Executive': 0.05 } } } },
          { name: 'budget', type: 'money', description: 'Annual budget', nullable: false, unique: false, distribution: { type: 'normal', params: { mean: 500000, stdDev: 200000 } }, minValue: 100000, maxValue: 2000000 },
        ],
      },
      {
        name: 'employees',
        description: 'Employee information',
        primaryKey: 'employee_id',
        rowCount: employeeCount,
        columns: [
          { name: 'employee_id', type: 'uuid', description: 'Unique employee identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'first_name', type: 'name', description: 'First name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'last_name', type: 'name', description: 'Last name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'email', type: 'email', description: 'Work email', nullable: false, unique: true, distribution: { type: 'uniform' } },
          { name: 'department_id', type: 'uuid', description: 'Department', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'Engineering': 0.30, 'Sales': 0.20, 'Marketing': 0.10, 'Finance': 0.08, 'HR': 0.05, 'Operations': 0.10, 'Product': 0.07, 'Legal': 0.03, 'Support': 0.04, 'Executive': 0.03 } } }, foreignKey: { table: 'departments', column: 'department_id' } },
          { name: 'job_title', type: 'string', description: 'Job title', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'Junior': 0.30, 'Mid-level': 0.35, 'Senior': 0.20, 'Lead': 0.10, 'Manager': 0.05 } } } },
          { name: 'salary', type: 'money', description: 'Annual salary', nullable: false, unique: false, distribution: { type: 'normal', params: { mean: 75000, stdDev: 25000 } }, minValue: 35000, maxValue: 250000 },
          { name: 'hire_date', type: 'date', description: 'Date hired', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'is_active', type: 'boolean', description: 'Currently employed', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'true': 0.92, 'false': 0.08 } } } },
          { name: 'performance_rating', type: 'float', description: 'Performance score (1-5)', nullable: true, unique: false, distribution: { type: 'normal', params: { mean: 3.5, stdDev: 0.7 } }, minValue: 1, maxValue: 5 },
        ],
      },
    ],
    relationships: [
      { from: { table: 'employees', column: 'department_id' }, to: { table: 'departments', column: 'department_id' }, type: 'one-to-many' },
    ],
    generationNotes: ['Salary follows normal distribution', 'Engineering is largest department', 'Performance ratings centered around 3.5'],
  };
}

// Social Media dataset schema
function generateSocialMediaSchema(request: GenerationRequest): DatasetSchema {
  const userCount = Math.max(100, Math.floor(request.rows / 5));

  return {
    name: 'social_media_dataset',
    description: 'Synthetic social media data with users, posts, and interactions',
    domain: 'social',
    tables: [
      {
        name: 'users',
        description: 'Social media users',
        primaryKey: 'user_id',
        rowCount: userCount,
        columns: [
          { name: 'user_id', type: 'uuid', description: 'Unique user identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'username', type: 'string', description: 'Username', nullable: false, unique: true, distribution: { type: 'uniform' } },
          { name: 'display_name', type: 'name', description: 'Display name', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'followers_count', type: 'integer', description: 'Number of followers', nullable: false, unique: false, distribution: { type: 'powerlaw', params: { alpha: 1.5 } }, minValue: 0, maxValue: 1000000 },
          { name: 'following_count', type: 'integer', description: 'Number following', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.005 } }, minValue: 0, maxValue: 5000 },
          { name: 'is_verified', type: 'boolean', description: 'Verified account', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'true': 0.02, 'false': 0.98 } } } },
          { name: 'created_at', type: 'datetime', description: 'Account creation date', nullable: false, unique: false, distribution: { type: 'uniform' } },
        ],
      },
      {
        name: 'posts',
        description: 'User posts/content',
        primaryKey: 'post_id',
        rowCount: request.rows,
        columns: [
          { name: 'post_id', type: 'uuid', description: 'Unique post identifier', nullable: false, unique: true, distribution: { type: 'sequential' } },
          { name: 'user_id', type: 'uuid', description: 'Author', nullable: false, unique: false, distribution: { type: 'powerlaw', params: { alpha: 1.8 } }, foreignKey: { table: 'users', column: 'user_id' } },
          { name: 'content', type: 'string', description: 'Post content', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'post_type', type: 'string', description: 'Type of post', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'text': 0.45, 'image': 0.35, 'video': 0.15, 'link': 0.05 } } }, enumValues: ['text', 'image', 'video', 'link'] },
          { name: 'likes_count', type: 'integer', description: 'Number of likes', nullable: false, unique: false, distribution: { type: 'powerlaw', params: { alpha: 2.0 } }, minValue: 0, maxValue: 100000 },
          { name: 'comments_count', type: 'integer', description: 'Number of comments', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.1 } }, minValue: 0, maxValue: 5000 },
          { name: 'shares_count', type: 'integer', description: 'Number of shares', nullable: false, unique: false, distribution: { type: 'exponential', params: { lambda: 0.2 } }, minValue: 0, maxValue: 1000 },
          { name: 'created_at', type: 'datetime', description: 'Post timestamp', nullable: false, unique: false, distribution: { type: 'uniform' } },
          { name: 'is_sponsored', type: 'boolean', description: 'Sponsored content', nullable: false, unique: false, distribution: { type: 'categorical', params: { weights: { 'true': 0.05, 'false': 0.95 } } } },
        ],
      },
    ],
    relationships: [
      { from: { table: 'posts', column: 'user_id' }, to: { table: 'users', column: 'user_id' }, type: 'one-to-many' },
    ],
    generationNotes: ['Follower counts follow power law (few influencers, many regular users)', 'Engagement metrics follow realistic distributions', 'Some users post much more than others'],
  };
}
