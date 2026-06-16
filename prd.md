# Tabula

AI-native workspace for CSV data

## Vision

CSV remains the universal data format used across sales, recruiting, operations, finance, marketing, logistics, and analytics.

Despite this, working with CSV files remains painful.

Users rely on spreadsheets, manual cleaning, formulas, and repetitive workflows to understand and transform their data.

Tabula enables users to upload any CSV file and interact with it using natural language.

Instead of learning Excel formulas or SQL, users can simply ask questions, clean data, compare files, and generate reports through an AI-powered workspace.

---

# Problem Statement

Users struggle with:

- Large CSV files
- Data cleaning
- Duplicate records
- Invalid formats
- Schema mismatches
- CSV imports
- CSV comparisons
- Repetitive transformations

Current tools require technical knowledge or manual work.

---

# Target Users

## Primary

- Recruiters
- Operations teams
- Sales teams
- Marketing teams
- Startup founders
- Customer success teams

## Secondary

- Analysts
- Data engineers
- Developers
- Agencies

---

# Core Value Proposition

Upload a CSV.

Ask questions.

Clean data.

Export results.

No spreadsheets.
No SQL.
No formulas.

---

# MVP Features

## 1. File Upload

Supported formats:

- CSV
- TSV
- XLSX

Capabilities:

- Drag and drop
- Large file support
- Auto delimiter detection
- Encoding detection

---

## 2. Smart Preview

After upload:

- Row preview
- Column preview
- Data type detection

Examples:

- Email
- Phone
- Date
- Number
- Currency
- Text

---

## 3. Data Health Score

System automatically analyzes:

- Missing values
- Duplicate rows
- Invalid emails
- Invalid phone numbers
- Invalid dates

Output:

Health Score: 87/100

Issues:

- 24 duplicates
- 11 invalid emails
- 5 malformed dates

---

## 4. AI Chat

Users can ask:

- Find duplicates
- Show inactive customers
- Which city generated most revenue
- Count customers by country
- Create summary report

The system translates requests into data operations.

---

## 5. One Click Cleaning

Actions:

- Remove duplicates
- Trim whitespace
- Normalize dates
- Fix capitalization
- Remove empty rows
- Standardize phone numbers

---

## 6. CSV Diff

Compare two files.

Show:

- Added rows
- Deleted rows
- Modified rows

Useful for:

- Daily exports
- Vendor updates
- CRM sync validation

---

## 7. Export

Export cleaned results as:

- CSV
- XLSX
- JSON

---

# Version 2

## AI Transformations

Examples:

"Keep only engineers from Bangalore"

"Split full name into first and last name"

"Convert revenue to yearly revenue"

---

## SQL Workspace

Advanced users can run:

- SELECT
- GROUP BY
- JOIN
- Aggregations

Powered by DuckDB.

---

## Chart Generation

Generate:

- Bar charts
- Pie charts
- Trend charts

Using natural language.

---

## Report Generation

Export:

- PDF
- Markdown
- Executive summaries

---

# Version 3

## Workflow Builder

Visual automation.

Upload CSV
→ Validate
→ Clean
→ Transform
→ Export

Save workflows.

---

## Scheduled Jobs

Run workflows:

- Daily
- Weekly
- Monthly

---

## API Platform

Endpoints:

POST /validate

POST /clean

POST /transform

POST /compare

POST /analyze

---

## Team Collaboration

- Shared projects
- Shared workflows
- Workspace permissions

---

# Technical Architecture

Frontend:

- Astro
- React
- Tailwind
- TanStack Table
- TanStack Query

Backend:

- Hono
- Cloudflare Workers

Storage:

- Cloudflare R2

Database:

- Cloudflare D1

Data Engine:

- DuckDB WASM

AI:

- Cloudflare worker ai

Authentication:

- Better Auth

Monitoring:

- Cloudflare Analytics

---

# Success Metrics

- Files uploaded
- Transformations executed
- AI conversations
- Weekly active users
- Export rate
- Paid conversion rate

---

# Launch Positioning

"The fastest way to clean, understand, and transform CSV data using AI."

Tagline:

Upload. Ask. Transform.
