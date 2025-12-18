// server/scripts/ingest-knowledge.ts
// Script to process and embed PCA/PCP documents into the knowledge base
// Supports .txt, .md, and .docx files

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';

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

interface DocumentConfig {
  filePath: string;
  type: 'theory' | 'example' | 'technique' | 'guideline';
  tags: string[];
  description?: string;
}

// Point to ACTUAL file locations - knowledge/ folder
const DOCUMENTS: DocumentConfig[] = [
  // Theory documents
  {
    filePath: './knowledge/thend-framework.txt',
    type: 'theory',
    tags: ['thend', 'integration', 'cvdc', 'cyvc'],
    description: 'Thend framework and integration theory'
  },
  {
    filePath: './knowledge/register-theory.txt',
    type: 'theory',
    tags: ['register', 'real', 'imaginary', 'symbolic'],
    description: 'Real/Imaginary/Symbolic register theory'
  },
  {
    filePath: './knowledge/css-stages.txt',
    type: 'theory',
    tags: ['css', 'stages', 'methodology'],
    description: 'CSS stage progression methodology'
  },
  {
    filePath: './knowledge/vasa-ultimate-goal.txt',
    type: 'theory',
    tags: ['vug', 'origin-trauma'],
    description: 'VASA Ultimate Goal - origin trauma integration'
  },

  // Examples
  {
    filePath: './knowledge/eve-case-study.txt',
    type: 'example',
    tags: ['cvdc', 'thend', 'case-study'],
    description: 'Eve case study demonstrating PCA methodology'
  },
  {
    filePath: './knowledge/example-intervention.txt',
    type: 'example',
    tags: ['symbolic-mapping', 'timing', 'intervention'],
    description: 'Example therapeutic intervention with timing'
  },

  // Techniques
  {
    filePath: './knowledge/hsfb-protocol.txt',
    type: 'technique',
    tags: ['hsfb', 'grounding', 'real', 'body'],
    description: 'HSFB protocol for register grounding'
  },

  // Guidelines
  {
    filePath: './knowledge/vasa-personality.txt',
    type: 'guideline',
    tags: ['voice', 'tone', 'personality'],
    description: 'VASA agent personality guidelines'
  },
  {
    filePath: './knowledge/vasa-voice-tone.txt',
    type: 'guideline',
    tags: ['voice', 'tone', 'style'],
    description: 'VASA voice and tone style guide'
  }
];

/**
 * Read file content - handles .txt, .md, and .docx
 */
async function readFileContent(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.docx') {
    // Use mammoth to extract text from Word documents
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } else {
    // Plain text files (.txt, .md, etc.)
    return fs.readFileSync(filePath, 'utf-8');
  }
}

/**
 * Chunk a document into smaller pieces with overlap
 */
function chunkDocument(
  content: string,
  chunkSize: number = 1200,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara) continue;

    if ((currentChunk + trimmedPara).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep some overlap
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(' ') + '\n\n' + trimmedPara;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

/**
 * Ingest a single document
 */
async function ingestDocument(config: DocumentConfig): Promise<number> {
  const fullPath = path.join(process.cwd(), config.filePath);
  console.log(`\n📄 Processing: ${config.filePath}`);

  if (!fs.existsSync(fullPath)) {
    console.log(`   ⚠️ File not found, skipping`);
    return 0;
  }

  try {
    const content = await readFileContent(fullPath);

    if (!content || content.trim().length < 50) {
      console.log(`   ⚠️ File too short or empty, skipping`);
      return 0;
    }

    const chunks = chunkDocument(content);
    const sourceName = path.basename(config.filePath);

    console.log(`   📦 Created ${chunks.length} chunks`);

    let inserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        const embedding = await generateEmbedding(chunk);

        const { error } = await getSupabase().from('knowledge_chunks').insert({
          content: chunk,
          embedding: embedding,
          metadata: {
            source: sourceName,
            type: config.type,
            tags: config.tags,
            description: config.description
          },
          source_document: config.filePath,
          chunk_index: i
        });

        if (error) {
          console.error(`   ❌ Chunk ${i}:`, error.message);
        } else {
          inserted++;
          process.stdout.write(`   ✅ ${i + 1}/${chunks.length}\r`);
        }

        // Rate limiting - OpenAI embeddings
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`   ❌ Chunk ${i}:`, error.message);
      }
    }

    console.log(`   ✅ Inserted ${inserted}/${chunks.length} chunks`);
    return inserted;

  } catch (error: any) {
    console.error(`   ❌ Error reading file:`, error.message);
    return 0;
  }
}

/**
 * Clear existing knowledge base
 */
async function clearKnowledgeBase(): Promise<void> {
  console.log('🗑️ Clearing existing knowledge base...');
  const { error } = await getSupabase()
    .from('knowledge_chunks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error clearing:', error.message);
  } else {
    console.log('✅ Cleared');
  }
}

/**
 * List all configured documents and their status
 */
function listDocuments(): void {
  console.log('\n📋 Configured Documents:\n');

  const byType: Record<string, DocumentConfig[]> = {};

  for (const doc of DOCUMENTS) {
    if (!byType[doc.type]) byType[doc.type] = [];
    byType[doc.type].push(doc);
  }

  for (const [type, docs] of Object.entries(byType)) {
    console.log(`\n${type.toUpperCase()}:`);
    for (const doc of docs) {
      const fullPath = path.join(process.cwd(), doc.filePath);
      const exists = fs.existsSync(fullPath);
      const status = exists ? '✅' : '❌';
      console.log(`  ${status} ${doc.filePath}`);
      if (doc.description) {
        console.log(`     └─ ${doc.description}`);
      }
    }
  }

  const existing = DOCUMENTS.filter(d => fs.existsSync(path.join(process.cwd(), d.filePath)));
  const missing = DOCUMENTS.filter(d => !fs.existsSync(path.join(process.cwd(), d.filePath)));

  console.log(`\n📊 Summary: ${existing.length} files found, ${missing.length} missing`);

  if (missing.length > 0) {
    console.log('\n💡 To add missing files, place them in:');
    console.log('   - ./attached_assets/ (for uploaded documents)');
    console.log('   - ./docs/ (for organized documentation)');
  }
}

/**
 * Main ingestion function
 */
async function main() {
  console.log('🚀 PCA/PCP Knowledge Base Ingestion Tool\n');
  console.log('='.repeat(50));

  const args = process.argv.slice(2);

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx server/scripts/ingest-knowledge.ts [options]

Options:
  --clear     Clear existing knowledge base before ingesting
  --list      List all configured documents and their status
  --help, -h  Show this help message

Supported file types:
  .txt, .md, .docx

Configuration:
  Edit the DOCUMENTS array in this file to add/remove documents.

Examples:
  npx tsx server/scripts/ingest-knowledge.ts --list
  npx tsx server/scripts/ingest-knowledge.ts --clear
  npx tsx server/scripts/ingest-knowledge.ts
`);
    return;
  }

  // List documents
  if (args.includes('--list')) {
    listDocuments();
    return;
  }

  // Clear existing data if requested
  if (args.includes('--clear')) {
    await clearKnowledgeBase();
  }

  // Find unique documents (avoid duplicates if same file in multiple locations)
  const processedPaths = new Set<string>();
  let totalChunks = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const doc of DOCUMENTS) {
    const fullPath = path.join(process.cwd(), doc.filePath);

    // Skip if we've already processed this file
    if (processedPaths.has(fullPath)) {
      continue;
    }

    if (fs.existsSync(fullPath)) {
      processedPaths.add(fullPath);
      const inserted = await ingestDocument(doc);
      totalChunks += inserted;
      if (inserted > 0) {
        filesProcessed++;
      }
    } else {
      filesSkipped++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Ingestion complete!`);
  console.log(`   Files processed: ${filesProcessed}`);
  console.log(`   Files not found: ${filesSkipped}`);
  console.log(`   Total chunks inserted: ${totalChunks}`);

  if (totalChunks === 0) {
    console.log('\n⚠️ No documents were ingested!');
    console.log('   Run with --list to see which files are missing.');
    console.log('   Add your PCA/PCP documents to ./attached_assets/ or ./docs/');
  }
}

main().catch(console.error);
