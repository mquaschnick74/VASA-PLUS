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
  userId?: string; // Supabase auth user ID — when provided, includes user's personal content
}

/**
 * Generate embedding for a text query with timeout
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // Limit input length
    });

    clearTimeout(timeoutId);
    console.log(`[RAG] Embedding generated in ${Date.now() - startTime}ms`);
    return response.data[0].embedding;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`[RAG] Embedding timed out after ${Date.now() - startTime}ms`);
    } else {
      console.error('[RAG] Embedding error:', error);
    }
    throw error;
  }
}

/**
 * Query the knowledge base for relevant chunks with timeout
 */
export async function queryKnowledgeBase(
  query: string,
  options: RagQueryOptions = {}
): Promise<KnowledgeChunk[]> {
  const { types, tags, limit = 5, threshold = 0.7, userId } = options;
  const startTime = Date.now();

  // Wrap in timeout to prevent hanging
  const timeoutPromise = new Promise<KnowledgeChunk[]>((_, reject) => {
    setTimeout(() => reject(new Error('RAG query timeout')), 5000); // 5 second total timeout
  });

  const queryPromise = async (): Promise<KnowledgeChunk[]> => {
    try {
      console.log(`[RAG] Querying: "${query.slice(0, 80)}..."`);

      const embedding = await generateEmbedding(query);
      console.log(`[RAG] Embedding ready, querying Supabase...`);

      const rpcStart = Date.now();
      const { data, error } = await supabase.rpc('match_knowledge_chunks', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit,
        filter_types: types || null,
        filter_tags: tags || null,
        // Only pass filter_user_id when explicitly querying per-user chunks.
        // Passing null here causes SQL `kc.user_id = NULL` which is always false,
        // excluding global rows (user_id IS NULL). Omit to skip user filtering entirely.
        ...(userId ? { filter_user_id: userId } : {})
      });
      console.log(`[RAG] Supabase RPC took ${Date.now() - rpcStart}ms`);

      if (error) {
        // RPC function might not exist yet - that's OK
        if (error.message?.includes('function') || error.code === '42883') {
          console.warn(`[RAG] RPC function not found - knowledge base not set up yet`);
          return [];
        }
        console.error('[RAG] Query error:', error);
        return [];
      }

      console.log(`[RAG] Retrieved ${data?.length || 0} chunks in ${Date.now() - startTime}ms total`);
      return (data || []) as KnowledgeChunk[];

    } catch (error) {
      console.error('[RAG] Query failed:', error);
      return [];
    }
  };

  try {
    return await Promise.race([queryPromise(), timeoutPromise]);
  } catch (error: any) {
    console.warn(`[RAG] Query timed out after ${Date.now() - startTime}ms`);
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
    // Convert snake_case to Title Case to match knowledge base content
    const stageMap: Record<string, string> = {
      'pointed_origin': 'Pointed Origin',
      'focus_bind': 'Focus Bind',
      'suspension': 'Suspension',
      'gesture_toward': 'Gesture Toward',
      'completion': 'Completion',
      'terminal': 'Terminal Symbol'
    };
    const stageName = stageMap[osr.movement.cssStage] || osr.movement.cssStage;
    parts.push(`CSS stage: ${stageName}`);
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
    threshold: 0.4
  });

  const context = buildRetrievedContext(chunks);

  return { chunks, context, query };
}
