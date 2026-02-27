// server/scripts/ingest-knowledge.ts
// Script to parse VASA-RAG-Knowledge-Base.md and ingest chunks into Supabase

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Lazy initialization of clients (only when needed)
let openai: OpenAI | null = null;
let supabase: ReturnType<typeof createClient> | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    openai = new OpenAI();
  }
  return openai;
}

function getSupabase(): ReturnType<typeof createClient> {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
    }
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

interface ParsedChunk {
  chunkId: string;
  title: string;
  type: 'protocol' | 'guideline' | 'orientation';
  tags: string[];
  content: string;
}

const KB_PATH = 'knowledge/VASA-RAG-Knowledge-Base.md';

/**
 * Parse the structured MD knowledge base into chunks
 */
function parseKnowledgeBase(): ParsedChunk[] {
  const fullPath = path.join(process.cwd(), KB_PATH);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Knowledge base file not found: ${fullPath}`);
  }

  const raw = fs.readFileSync(fullPath, 'utf-8');

  // Split on ### CHUNK boundaries
  const parts = raw.split(/^### CHUNK/m);

  // Skip the preamble (everything before the first ### CHUNK)
  const chunkParts = parts.slice(1);

  const chunks: ParsedChunk[] = [];

  for (const part of chunkParts) {
    const lines = part.split('\n');

    // Parse title line, e.g. " 1.1 — CSS Stage: Pointed Origin (⊙)"
    const titleLine = lines[0].trim();
    const titleMatch = titleLine.match(/^(\d+\.\d+)\s*[—–-]\s*(.+?)(?:\s*\([^)]*\)\s*)?$/);
    if (!titleMatch) {
      console.warn(`⚠️ Could not parse chunk header: "${titleLine.slice(0, 80)}"`);
      continue;
    }
    const chunkId = titleMatch[1];
    const title = titleMatch[2].trim();

    // Parse Type line
    const typeLine = lines.find(l => l.startsWith('**Type:**'));
    if (!typeLine) {
      console.warn(`⚠️ No Type line found for chunk ${chunkId}`);
      continue;
    }
    const typeMatch = typeLine.match(/`(\w+)`/);
    const type = (typeMatch ? typeMatch[1] : 'protocol') as ParsedChunk['type'];

    // Parse Tags line
    const tagsLine = lines.find(l => l.startsWith('**Tags:**'));
    if (!tagsLine) {
      console.warn(`⚠️ No Tags line found for chunk ${chunkId}`);
      continue;
    }
    const tags: string[] = [];
    const tagMatches = tagsLine.matchAll(/`([^`]+)`/g);
    for (const m of tagMatches) {
      tags.push(m[1]);
    }

    // Extract content body: everything after the first --- separator after Tags, up to trailing ---
    const tagsLineIndex = lines.findIndex(l => l.startsWith('**Tags:**'));
    let contentStartIndex = -1;
    for (let i = tagsLineIndex + 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        contentStartIndex = i + 1;
        break;
      }
    }

    if (contentStartIndex === -1) {
      console.warn(`⚠️ No content separator found for chunk ${chunkId}`);
      continue;
    }

    // Find trailing --- (end of chunk content)
    let contentEndIndex = lines.length;
    for (let i = lines.length - 1; i >= contentStartIndex; i--) {
      if (lines[i].trim() === '---') {
        contentEndIndex = i;
        break;
      }
    }

    const content = lines.slice(contentStartIndex, contentEndIndex).join('\n').trim();

    if (!content) {
      console.warn(`⚠️ Empty content for chunk ${chunkId}`);
      continue;
    }

    chunks.push({ chunkId, title, type, tags, content });
  }

  return chunks;
}

/**
 * Split content into sub-chunks at paragraph boundaries with overlap
 */
function subChunk(content: string, maxSize: number = 6000, overlap: number = 200): string[] {
  if (content.length <= maxSize) {
    return [content];
  }

  const paragraphs = content.split(/\n\n+/);
  const subChunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if ((current + '\n\n' + trimmed).length > maxSize && current.length > 0) {
      subChunks.push(current.trim());
      // Overlap: keep tail of current chunk
      const words = current.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(' ') + '\n\n' + trimmed;
    } else {
      current += (current ? '\n\n' : '') + trimmed;
    }
  }

  if (current.trim()) {
    subChunks.push(current.trim());
  }

  return subChunks;
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 30000),
  });
  return response.data[0].embedding;
}

/**
 * Clear global knowledge chunks (preserve user-submitted chunks)
 */
async function clearGlobalChunks(): Promise<void> {
  console.log('🗑️ Clearing global knowledge chunks (preserving user-submitted)...');
  const { data, error } = await getSupabase()
    .from('knowledge_chunks')
    .delete()
    .is('user_id', null)
    .select('id');

  if (error) {
    console.error('❌ Error clearing:', error.message);
  } else {
    const count = data?.length || 0;
    console.log(`✅ Cleared ${count} global chunks`);
  }
}

/**
 * List all chunks from the MD file without ingesting
 */
function listChunks(): void {
  const chunks = parseKnowledgeBase();
  console.log(`\n📋 Knowledge Base: ${chunks.length} chunks\n`);
  console.log('ID     | Type        | Tags | Chars  | Title');
  console.log('-------|-------------|------|--------|------');
  for (const chunk of chunks) {
    const id = chunk.chunkId.padEnd(6);
    const type = chunk.type.padEnd(11);
    const tagCount = String(chunk.tags.length).padStart(4);
    const chars = String(chunk.content.length).padStart(6);
    console.log(`${id} | ${type} | ${tagCount} | ${chars} | ${chunk.title}`);
  }
  console.log(`\n📊 Total: ${chunks.length} chunks`);
}

/**
 * Ingest all chunks into Supabase
 */
async function ingestAll(): Promise<void> {
  const chunks = parseKnowledgeBase();
  console.log(`\n📦 Ingesting ${chunks.length} chunks from ${KB_PATH}\n`);

  let totalInserted = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const subChunks = subChunk(chunk.content);

    for (let j = 0; j < subChunks.length; j++) {
      const text = subChunks[j];

      try {
        const embedding = await generateEmbedding(text);

        const { error } = await getSupabase().from('knowledge_chunks').insert({
          content: text,
          embedding: embedding,
          metadata: {
            source: 'VASA-RAG-Knowledge-Base',
            type: chunk.type,
            tags: chunk.tags,
            chunk_id: chunk.chunkId,
            title: chunk.title
          },
          source_document: KB_PATH,
          chunk_index: j,
          user_id: null
        });

        if (error) {
          console.error(`❌ Chunk ${chunk.chunkId} sub ${j}: ${error.message}`);
        } else {
          totalInserted++;
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err: any) {
        console.error(`❌ Chunk ${chunk.chunkId} sub ${j}: ${err.message}`);
      }
    }

    console.log(`✅ Chunk ${chunk.chunkId} (${i + 1}/${chunks.length}): "${chunk.title}" — ${subChunks.length} sub-chunk(s) inserted`);
  }

  console.log(`\n✅ Ingestion complete: ${totalInserted} total rows inserted`);
}

/**
 * Main
 */
async function main() {
  console.log('🚀 VASA Knowledge Base Ingestion Tool\n');
  console.log('='.repeat(50));

  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx server/scripts/ingest-knowledge.ts [options]

Options:
  --clear     Clear global chunks then ingest
  --list      List all chunks (no ingestion)
  --help, -h  Show this help message

Examples:
  npx tsx server/scripts/ingest-knowledge.ts --list
  npx tsx server/scripts/ingest-knowledge.ts --clear
  npx tsx server/scripts/ingest-knowledge.ts
`);
    return;
  }

  if (args.includes('--list')) {
    listChunks();
    return;
  }

  if (args.includes('--clear')) {
    await clearGlobalChunks();
  }

  await ingestAll();
}

main().catch(console.error);
