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
    type: 'theory' | 'example' | 'technique' | 'guideline' | 'protocol' | 'orientation';
    tags: string[];
  };
  similarity: number;
}

export interface RagQueryOptions {
  types?: Array<'theory' | 'example' | 'technique' | 'guideline' | 'protocol' | 'orientation'>;
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
      input: text.slice(0, 30000), // Limit input length
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
        query_embedding: `[${embedding.join(',')}]`,
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
      console.log(`[RAG-DEBUG] Embedding length: ${embedding.length}, first 3 values: ${embedding.slice(0,3)}`);
      console.log(`[RAG-DEBUG] RPC data type: ${typeof data}, length: ${data?.length}, error: ${error}`);
      console.log(`[RAG-DEBUG] filter_types: ${JSON.stringify(types || null)}, threshold: ${threshold}`);

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

  // CSS stage — descriptive language matching KB content
  if (osr.movement?.cssStage) {
    const stageDescriptions: Record<string, string> = {
      'pointed_origin': 'Pointed Origin stage: initial therapeutic engagement, perceptual fragmentation, grounding in body and sensation, establishing therapeutic container',
      'focus_bind': 'Focus Bind stage: introducing contradiction CVDC, holding opposing positions simultaneously, developing capacity for psychological tension',
      'suspension': 'Suspension stage: holding contradiction without resolution, tolerating ambiguity, deepening somatic awareness of tension',
      'gesture_toward': 'Gesture Toward stage: movement toward integration, Thend emerging, symbolic connection forming between fragmented elements',
      'completion': 'Completion stage: integration achieved, CYVC emerging, new symbolic capacity, testing insights across contexts',
      'terminal': 'Terminal Symbol stage: consolidated integration, symbolic wholeness, preparing for termination or new cycle'
    };
    const desc = stageDescriptions[osr.movement.cssStage];
    if (desc) {
      parts.push(desc);
    }
  }

  // Pattern context — descriptive
  if (osr.patterns?.activePatterns?.length > 0) {
    const pattern = osr.patterns.activePatterns[0];
    const patternDescriptions: Record<string, string> = {
      'CVDC': 'contradiction detected: user holds two incompatible positions simultaneously, living paradox requiring holding not resolution',
      'IBM': 'intention-behavior mismatch: gap between what user wants to do and what they actually do',
      'Thend': 'breakthrough moment emerging: integration of contradiction, symbolic function restoring',
      'CYVC': 'conclusion forming: variable yet constant resolution, new operational capacity emerging'
    };
    const desc = patternDescriptions[pattern.patternType] || `pattern: ${pattern.description || pattern.patternType}`;
    parts.push(desc);
  }

  // Register context
  if (osr.register?.currentRegister) {
    parts.push(`register: ${osr.register.currentRegister}`);
    if (osr.register.stucknessScore > 0.6) {
      parts.push('stuck in register, repetition pattern, needs movement');
    }
  }

  // Anticipation/timing
  if (osr.movement?.anticipation?.timing?.phase === 'ready') {
    parts.push('intervention timing ready, therapeutic moment approaching');
  }

  // Symbolic mapping
  if (osr.symbolic?.generativeInsight?.potentialConnection) {
    parts.push('symbolic connection possible, Impressionate function engaging');
    if (osr.symbolic.generativeInsight.potentialConnection.connectionInsight) {
      parts.push(osr.symbolic.generativeInsight.potentialConnection.connectionInsight.slice(0, 150));
    }
  }

  // Default fallback
  if (parts.length === 0) {
    parts.push('PCA therapeutic guidance: grounding, register awareness, HSFB modalities, perceptual integration');
  }

  return parts.join('. ');
}

/**
 * Determine which document types are most relevant
 */
export function determineRelevantTypes(osr: OrientationStateRegister): Array<'theory' | 'example' | 'technique' | 'guideline' | 'protocol' | 'orientation'> {
  const types: Set<string> = new Set(['guideline', 'protocol']);

  const phase = osr.movement?.anticipation?.timing?.phase;
  if (phase === 'ready' || phase === 'approaching_readiness') {
    types.add('orientation');
    types.add('theory');
  }

  if (osr.register?.stucknessScore > 0.5) {
    types.add('orientation');
  }

  if (osr.symbolic?.generativeInsight?.potentialConnection) {
    types.add('orientation');
  }

  return Array.from(types) as Array<'theory' | 'example' | 'technique' | 'guideline' | 'protocol' | 'orientation'>;
}

/**
 * Determine relevant tags based on current state
 */
export function determineRelevantTags(osr: OrientationStateRegister): string[] {
  const tags: string[] = [];

  // CSS stage tag mapping: snake_case OSR values → hyphenated KB tags
  const cssTagMap: Record<string, string[]> = {
    'pointed_origin': ['pointed-origin', 'css', 'opening'],
    'focus_bind': ['focus-bind', 'css', 'cvdc'],
    'suspension': ['suspension', 'css'],
    'gesture_toward': ['gesture-toward', 'css', 'thend'],
    'completion': ['completion', 'css', 'integration'],
    'terminal': ['terminal-symbol', 'css']
  };

  if (osr.movement?.cssStage) {
    const mapped = cssTagMap[osr.movement.cssStage];
    if (mapped) {
      tags.push(...mapped);
    } else {
      tags.push('css');
    }
  }

  // Register tags (match KB as-is: 'real', 'imaginary', 'symbolic')
  if (osr.register?.currentRegister) {
    const reg = osr.register.currentRegister.toLowerCase();
    tags.push(reg);
    tags.push('register');
  }

  // Pattern type tags (uppercase from OSR → lowercase for KB)
  if (osr.patterns?.activePatterns?.length > 0) {
    osr.patterns.activePatterns.forEach((p) => {
      if (p.patternType) {
        tags.push(p.patternType.toLowerCase());
      }
    });
  }

  // Movement tags
  if (osr.movement?.trajectory === 'toward_mastery') {
    tags.push('integration');
    tags.push('thend');
  }

  // Symbolic tags
  if (osr.symbolic?.generativeInsight?.potentialConnection) {
    tags.push('impressionate');
  }

  // Stuckness tags
  if (osr.register?.stucknessScore > 0.6) {
    tags.push('repetition');
  }

  return Array.from(new Set(tags));
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
    limit: 4,
    threshold: 0.4
  });

  const context = buildRetrievedContext(chunks);

  return { chunks, context, query };
}
