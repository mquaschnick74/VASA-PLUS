# iVASA Knowledge Retrieval Setup Guide

This guide walks you through activating the knowledge retrieval (RAG) system that connects your Supabase database to VASA's therapeutic AI.

## Overview

Your codebase already has the RAG logic built! Here's what exists:

| Component | Location | Status |
|-----------|----------|--------|
| Query Logic | `server/services/sensing-layer/knowledge-base.ts` | ✅ Complete |
| Ingestion Script | `server/scripts/ingest-knowledge.ts` | ✅ Complete |
| Knowledge Documents | `knowledge/*.txt` (9 files) | ✅ Complete |
| Supabase Client | `server/services/supabase-service.ts` | ✅ Complete |
| Database Table | `public.knowledge_chunks` | ✅ You created this |
| **RPC Function** | `match_knowledge_chunks` | ❌ **NEED TO CREATE** |

---

## Step 1: Create the RPC Function in Supabase

This is the missing piece that makes everything work.

### 1.1 Open Supabase SQL Editor

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **New query**

### 1.2 Copy and Run the SQL

Copy the entire contents of this file and paste it into the SQL Editor:

```
supabase/functions/match_knowledge_chunks.sql
```

Or copy this directly:

```sql
-- Drop existing function if it exists
DROP FUNCTION IF EXISTS match_knowledge_chunks(vector(1536), float, int, text[], text[]);

-- Create the vector similarity search function
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  filter_types text[] DEFAULT NULL,
  filter_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.metadata,
    (1 - (kc.embedding <=> query_embedding))::float AS similarity
  FROM
    public.knowledge_chunks kc
  WHERE
    (1 - (kc.embedding <=> query_embedding)) >= match_threshold
    AND (
      filter_types IS NULL
      OR kc.metadata->>'type' = ANY(filter_types)
    )
    AND (
      filter_tags IS NULL
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(kc.metadata->'tags') AS tag
        WHERE tag = ANY(filter_tags)
      )
    )
  ORDER BY
    kc.embedding <=> query_embedding ASC
  LIMIT
    match_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(vector(1536), float, int, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(vector(1536), float, int, text[], text[]) TO service_role;
```

### 1.3 Verify the Function Was Created

Run this query in the SQL Editor:

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'match_knowledge_chunks';
```

You should see one row with `match_knowledge_chunks`.

---

## Step 2: Verify Environment Variables

Make sure your `.env` file has these variables set:

```bash
# Required for embeddings (generates query vectors)
OPENAI_API_KEY=sk-...

# Required for Supabase connection (uses SERVICE key, not ANON)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Required for guidance generation (Claude)
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Step 3: Ingest Your Knowledge Documents

Now populate your database with the PCA/PCP knowledge documents.

### 3.1 Check Which Files Exist

```bash
npx tsx server/scripts/ingest-knowledge.ts --list
```

This shows all configured documents and whether they exist.

### 3.2 Ingest the Documents

```bash
# Optional: Clear existing chunks first
npx tsx server/scripts/ingest-knowledge.ts --clear

# Ingest all documents
npx tsx server/scripts/ingest-knowledge.ts
```

Expected output:
```
🚀 PCA/PCP Knowledge Base Ingestion Tool
==================================================

📄 Processing: ./knowledge/thend-framework.txt
   📦 Created 5 chunks
   ✅ Inserted 5/5 chunks

📄 Processing: ./knowledge/register-theory.txt
   📦 Created 3 chunks
   ✅ Inserted 3/3 chunks

... (continues for all 9 documents)

==================================================
✅ Ingestion complete!
   Files processed: 9
   Files not found: 0
   Total chunks inserted: ~30-40
```

### 3.3 Verify Data in Supabase

In your Supabase Dashboard, go to **Table Editor** > **knowledge_chunks** and verify you see rows with content and embeddings.

---

## Step 4: Test the RAG Pipeline

### 4.1 Quick Test via Node

Create a test file `test-rag.ts`:

```typescript
import 'dotenv/config';
import { queryKnowledgeBase } from './server/services/sensing-layer/knowledge-base';

async function test() {
  console.log('Testing RAG query...\n');

  const results = await queryKnowledgeBase(
    'What is the THEND framework for therapeutic integration?',
    { types: ['theory'], limit: 3, threshold: 0.6 }
  );

  console.log(`Found ${results.length} relevant chunks:\n`);

  results.forEach((chunk, i) => {
    console.log(`--- Chunk ${i + 1} (${(chunk.similarity * 100).toFixed(1)}% match) ---`);
    console.log(`Source: ${chunk.metadata.source}`);
    console.log(`Content: ${chunk.content.slice(0, 200)}...`);
    console.log();
  });
}

test().catch(console.error);
```

Run it:
```bash
npx tsx test-rag.ts
```

### 4.2 Check Server Logs

When VASA processes a user message, you should see logs like:

```
[RAG] Querying: "pattern: CVDC | register: Imaginary | stuck in register..."
[RAG] Embedding generated in 150ms
[RAG] Supabase RPC took 45ms
[RAG] Retrieved 4 chunks in 200ms total
```

---

## How It All Works (Architecture)

```
User speaks/types something
        ↓
┌─────────────────────────────────────┐
│     SENSING LAYER                   │
│  Detects patterns, registers,       │
│  movement, symbolic mappings        │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  BUILD ORIENTATION STATE REGISTER   │
│  (OSR) - summary of user's state    │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│     RAG QUERY                       │
│  buildRagQuery(osr) → query string  │
│  "pattern: CVDC | register: stuck"  │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│     GENERATE EMBEDDING              │
│  OpenAI text-embedding-3-small      │
│  → 1536-dimensional vector          │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│     SUPABASE RPC                    │
│  match_knowledge_chunks(            │
│    embedding, threshold, limit,     │
│    types, tags                      │
│  )                                  │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│     RELEVANT CHUNKS RETURNED        │
│  Most similar PCA/PCP guidance      │
│  from your knowledge base           │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│     GUIDANCE GENERATION             │
│  Claude API receives:               │
│  - User's message                   │
│  - OSR (therapeutic state)          │
│  - Retrieved PCA/PCP context ← RAG  │
│  → Generates therapeutic response   │
└─────────────────────────────────────┘
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `server/services/sensing-layer/knowledge-base.ts` | RAG query functions |
| `server/services/sensing-layer/guidance-generator.ts` | Uses RAG at line 483-500 |
| `server/scripts/ingest-knowledge.ts` | Populates knowledge base |
| `knowledge/*.txt` | Your PCA/PCP source documents |
| `supabase/functions/match_knowledge_chunks.sql` | The RPC function SQL |

---

## Troubleshooting

### "RPC function not found" in logs
→ Run the SQL in Step 1 to create the function

### No chunks retrieved (empty results)
→ Check that you ran the ingestion script (Step 3)
→ Lower the `threshold` to 0.5 to be less strict

### "OPENAI_API_KEY environment variable is required"
→ Add your OpenAI API key to `.env`

### "Missing SUPABASE_URL" or "Missing Supabase SERVICE key"
→ Add both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env`

### Embeddings take too long (>3 seconds)
→ Check your OpenAI API rate limits
→ The code has built-in timeouts and will gracefully skip RAG if too slow

---

## Adding New Knowledge Documents

1. Add your `.txt`, `.md`, or `.docx` file to the `knowledge/` folder

2. Edit `server/scripts/ingest-knowledge.ts` and add an entry to the `DOCUMENTS` array:

```typescript
{
  filePath: './knowledge/your-new-document.txt',
  type: 'theory',  // or 'example', 'technique', 'guideline'
  tags: ['relevant', 'tags', 'here'],
  description: 'Description of this document'
}
```

3. Run the ingestion:
```bash
npx tsx server/scripts/ingest-knowledge.ts
```
