// server/services/sensing-layer/knowledge-base.ts
// RAG (Retrieval-Augmented Generation) service for PCA/PCP guidance

import OpenAI from 'openai';
import { supabase } from '../supabase-service';
import { OrientationStateRegister } from './types';

const openai = new OpenAI();

export interface KnowledgeChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    type: 'theory' | 'example' | 'technique' | 'guideline';
    tags: string[];
  };
  similarity: number;
}

export interface RagQueryOptions {
  types?: Array<'theory' | 'example' | 'technique' | 'guideline'>;
  tags?: string[];
  limit?: number;
  threshold?: number;
}

/**
 * Generate embedding for a text query
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // Limit input length
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('[RAG] Embedding error:', error);
    throw error;
  }
}

/**
 * Query the knowledge base for relevant chunks
 */
export async function queryKnowledgeBase(
  query: string,
  options: RagQueryOptions = {}
): Promise<KnowledgeChunk[]> {
  const { types, tags, limit = 5, threshold = 0.7 } = options;

  try {
    console.log(`[RAG] Querying: "${query.slice(0, 100)}..."`);

    const embedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      filter_types: types || null,
      filter_tags: tags || null
    });

    if (error) {
      console.error('[RAG] Query error:', error);
      return [];
    }

    console.log(`[RAG] Retrieved ${data?.length || 0} chunks`);
    return (data || []) as KnowledgeChunk[];

  } catch (error) {
    console.error('[RAG] Query failed:', error);
    return [];
  }
}

/**
 * Build a formatted context string from retrieved chunks
 */
export function buildRetrievedContext(chunks: KnowledgeChunk[]): string {
  if (!chunks || chunks.length === 0) {
    return '';
  }

  let context = '\n## Retrieved PCA/PCP Guidance\n\n';

  chunks.forEach((chunk) => {
    const typeLabel = chunk.metadata.type.toUpperCase();
    const source = chunk.metadata.source || 'Unknown';
    const similarity = (chunk.similarity * 100).toFixed(1);

    context += `### [${typeLabel}] ${source} (${similarity}% match)\n`;
    context += `${chunk.content.trim()}\n\n`;
  });

  context += '---\n\n';

  return context;
}

/**
 * Build a RAG query based on the current orientation state
 */
export function buildRagQuery(osr: OrientationStateRegister): string {
  const parts: string[] = [];

  // Pattern context
  if (osr.patterns?.activePatterns?.length > 0) {
    const pattern = osr.patterns.activePatterns[0];
    parts.push(`pattern: ${pattern.description || pattern.patternType}`);
  }

  // Register context
  if (osr.register?.currentRegister) {
    parts.push(`register: ${osr.register.currentRegister}`);

    if (osr.register.stucknessScore > 0.6) {
      parts.push('stuck in register');
    }
  }

  // CSS stage
  if (osr.movement?.cssStage) {
    parts.push(`CSS stage: ${osr.movement.cssStage}`);
  }

  // Anticipation/timing
  if (osr.movement?.anticipation?.timing?.phase === 'ready') {
    parts.push('intervention timing ready');
  } else if (osr.movement?.anticipation?.timing?.phase === 'approaching_readiness') {
    parts.push('approaching intervention');
  }

  // Symbolic mapping - generative insight
  if (osr.symbolic?.generativeInsight?.potentialConnection) {
    parts.push('symbolic connection possible');
    if (osr.symbolic.generativeInsight.potentialConnection.connectionInsight) {
      parts.push(osr.symbolic.generativeInsight.potentialConnection.connectionInsight.slice(0, 100));
    }
  }

  // Movement trajectory
  if (osr.movement?.trajectory) {
    parts.push(`movement: ${osr.movement.trajectory}`);
  }

  // Default fallback
  if (parts.length === 0) {
    parts.push('therapeutic guidance PCA methodology');
  }

  return parts.join(' | ');
}

/**
 * Determine which document types are most relevant
 */
export function determineRelevantTypes(osr: OrientationStateRegister): Array<'theory' | 'example' | 'technique' | 'guideline'> {
  const types: Array<'theory' | 'example' | 'technique' | 'guideline'> = [];

  // Always include theory as baseline
  types.push('theory');

  // If intervention timing is ready or approaching, include examples
  const phase = osr.movement?.anticipation?.timing?.phase;
  if (phase === 'ready' || phase === 'approaching_readiness') {
    types.push('example');
  }

  // If register is stuck, include techniques
  if (osr.register?.stucknessScore > 0.5) {
    types.push('technique');
  }

  // If symbolic connection is active, include examples
  if (osr.symbolic?.generativeInsight?.potentialConnection) {
    if (!types.includes('example')) types.push('example');
  }

  return types;
}

/**
 * Determine relevant tags based on current state
 */
export function determineRelevantTags(osr: OrientationStateRegister): string[] {
  const tags: string[] = [];

  // Register tags
  if (osr.register?.currentRegister) {
    tags.push(osr.register.currentRegister.toLowerCase());
  }

  // CSS stage tags
  if (osr.movement?.cssStage) {
    tags.push(osr.movement.cssStage);
  }

  // Pattern type tags
  if (osr.patterns?.activePatterns?.length > 0) {
    osr.patterns.activePatterns.forEach((p) => {
      if (p.patternType) tags.push(p.patternType);
    });
  }

  // Movement tags
  if (osr.movement?.trajectory === 'toward_mastery') {
    tags.push('integration');
  }

  // Symbolic tags
  if (osr.symbolic?.generativeInsight?.potentialConnection) {
    tags.push('symbolic-mapping');
  }

  return Array.from(new Set(tags)); // Remove duplicates
}

/**
 * High-level function to query RAG based on orientation state
 */
export async function getRelevantGuidance(osr: OrientationStateRegister): Promise<{
  chunks: KnowledgeChunk[];
  context: string;
  query: string;
}> {
  const query = buildRagQuery(osr);
  const types = determineRelevantTypes(osr);
  const tags = determineRelevantTags(osr);

  const chunks = await queryKnowledgeBase(query, {
    types,
    tags,
    limit: 4,
    threshold: 0.65
  });

  const context = buildRetrievedContext(chunks);

  return { chunks, context, query };
}
