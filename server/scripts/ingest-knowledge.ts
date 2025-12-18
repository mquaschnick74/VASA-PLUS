// server/scripts/ingest-knowledge.ts
// Script to process and embed PCA/PCP documents into the knowledge base

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Initialize clients
const openai = new OpenAI();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DocumentConfig {
  filePath: string;
  type: 'theory' | 'example' | 'technique' | 'guideline';
  tags: string[];
  description?: string;
}

// Configure your documents here
const DOCUMENTS: DocumentConfig[] = [
  // Theory documents
  {
    filePath: 'docs/pca/thend-framework.txt',
    type: 'theory',
    tags: ['thend', 'integration', 'cvdc', 'cyvc'],
    description: 'Thend framework and integration theory'
  },
  {
    filePath: 'docs/pca/css-stages.txt',
    type: 'theory',
    tags: ['css', 'stages', 'pointed_origin', 'suspension', 'completion'],
    description: 'CSS stage progression methodology'
  },
  {
    filePath: 'docs/pca/register-theory.txt',
    type: 'theory',
    tags: ['register', 'real', 'imaginary', 'symbolic'],
    description: 'Real/Imaginary/Symbolic register theory'
  },
  {
    filePath: 'docs/pca/cvdc-ibm-theory.txt',
    type: 'theory',
    tags: ['cvdc', 'ibm', 'contradiction', 'pattern'],
    description: 'CVDC and IBM pattern theory'
  },

  // Example transcripts
  {
    filePath: 'docs/examples/dom-session.txt',
    type: 'example',
    tags: ['symbolic-mapping', 'intervention', 'relational', 'timing'],
    description: 'Dom therapy session - violin to partner symbolic connection'
  },
  {
    filePath: 'docs/examples/eve-case-study.txt',
    type: 'example',
    tags: ['cvdc', 'thend', 'integration'],
    description: 'Eve case study demonstrating PCA methodology'
  },

  // Techniques
  {
    filePath: 'docs/techniques/hsfb-protocol.txt',
    type: 'technique',
    tags: ['hsfb', 'grounding', 'real', 'body', 'somatic'],
    description: 'HSFB protocol for register grounding'
  },
  {
    filePath: 'docs/techniques/register-movement.txt',
    type: 'technique',
    tags: ['register', 'intervention', 'movement', 'stuck'],
    description: 'Techniques for moving between registers'
  },
  {
    filePath: 'docs/techniques/symbolic-intervention.txt',
    type: 'technique',
    tags: ['symbolic', 'intervention', 'timing', 'connection'],
    description: 'How to facilitate symbolic connections'
  },

  // Guidelines
  {
    filePath: 'docs/guidelines/vasa-personality.txt',
    type: 'guideline',
    tags: ['voice', 'tone', 'personality', 'warmth'],
    description: 'VASA agent personality and voice guidelines'
  },
  {
    filePath: 'docs/guidelines/therapeutic-boundaries.txt',
    type: 'guideline',
    tags: ['boundaries', 'safety', 'ethics'],
    description: 'Therapeutic boundaries and safety guidelines'
  }
];

/**
 * Chunk a document into smaller pieces with overlap
 */
function chunkDocument(
  content: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];

  // Split by paragraphs first to preserve meaning
  const paragraphs = content.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep overlap from end of previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

/**
 * Ingest a single document
 */
async function ingestDocument(config: DocumentConfig): Promise<number> {
  console.log(`\n📄 Processing: ${config.filePath}`);

  const fullPath = path.join(process.cwd(), config.filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`   ⚠️ File not found: ${fullPath}, skipping`);
    return 0;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const chunks = chunkDocument(content);
  const sourceName = path.basename(config.filePath);

  console.log(`   📦 Created ${chunks.length} chunks`);

  let inserted = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const embedding = await generateEmbedding(chunk);

      const { error } = await supabase.from('knowledge_chunks').insert({
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
        console.error(`   ❌ Error inserting chunk ${i}:`, error.message);
      } else {
        inserted++;
        process.stdout.write(`   ✅ Chunk ${i + 1}/${chunks.length}\r`);
      }

      // Rate limiting - OpenAI embeddings
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`   ❌ Error processing chunk ${i}:`, error);
    }
  }

  console.log(`   ✅ Inserted ${inserted}/${chunks.length} chunks`);
  return inserted;
}

/**
 * Clear existing knowledge base
 */
async function clearKnowledgeBase(): Promise<void> {
  console.log('🗑️ Clearing existing knowledge base...');
  const { error } = await supabase.from('knowledge_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error('Error clearing:', error.message);
  } else {
    console.log('✅ Cleared');
  }
}

/**
 * List files in docs directory
 */
function listDocsDirectory(): void {
  const docsPath = path.join(process.cwd(), 'docs');

  if (!fs.existsSync(docsPath)) {
    console.log('\n📁 docs/ directory does not exist. Create it with:');
    console.log('   mkdir -p docs/pca docs/examples docs/techniques docs/guidelines');
    return;
  }

  console.log('\n📁 Files in docs/ directory:');

  function walkDir(dir: string, indent: string = '  '): void {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        console.log(`${indent}📂 ${file}/`);
        walkDir(filePath, indent + '  ');
      } else {
        console.log(`${indent}📄 ${file}`);
      }
    }
  }

  walkDir(docsPath);
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
  --list      List files in docs/ directory
  --help, -h  Show this help message

Configuration:
  Edit the DOCUMENTS array in this file to configure which documents to ingest.

Example:
  npx tsx server/scripts/ingest-knowledge.ts --clear
`);
    return;
  }

  // List docs
  if (args.includes('--list')) {
    listDocsDirectory();
    return;
  }

  // Clear existing data if requested
  if (args.includes('--clear')) {
    await clearKnowledgeBase();
  }

  let totalChunks = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const doc of DOCUMENTS) {
    const fullPath = path.join(process.cwd(), doc.filePath);
    if (fs.existsSync(fullPath)) {
      const inserted = await ingestDocument(doc);
      totalChunks += inserted;
      filesProcessed++;
    } else {
      filesSkipped++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Ingestion complete!`);
  console.log(`   Files processed: ${filesProcessed}`);
  console.log(`   Files skipped (not found): ${filesSkipped}`);
  console.log(`   Total chunks inserted: ${totalChunks}`);

  if (filesSkipped > 0) {
    console.log(`\n💡 Create missing files in docs/ directory to ingest them.`);
    console.log(`   Run with --list to see existing files.`);
  }
}

main().catch(console.error);
