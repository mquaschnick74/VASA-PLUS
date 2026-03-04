// server/services/sensing-layer/narrative-web.ts
// Narrative Web Service - Interfaces with narrative_fragments and resonance_links tables

import { supabase } from '../supabase-service';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NarrativeFragment {
  id: string;
  fragment_type: string;
  content_summary: string;
  characters: string[];
  content_domain: string;
  register_signature: Record<string, any>;
  emotional_markers: any[];
  structural_patterns: any[];
  investment_signals: string[];
  css_stage_at_disclosure: string | null;
  session_id: string;
  created_at: string;
  similarity?: number;
}

export interface ResonanceLink {
  link_id: string;
  fragment_a_id: string;
  fragment_b_id: string;
  resonance_type: string;
  strength: number;
  evidence: any[];
  detected_by: string[];
  first_detected: string;
  last_reinforced: string;
}

export interface Constellation {
  constellation_id: number;
  fragment_ids: string[];
  avg_strength: number;
  fragment_count: number;
}

export interface ResonanceResult {
  matchedFragments: NarrativeFragment[];
  activeLinks: ResonanceLink[];
  constellationFragments: NarrativeFragment[];
  isConstellationActive: boolean;
}

export interface NewNarrativeFragment {
  user_id: string;
  session_id: string;
  fragment_type: string;
  content_summary: string;
  characters: string[];
  content_domain: string;
  register_signature: Record<string, any>;
  emotional_markers: any[];
  structural_patterns: any[];
  investment_signals: string[];
  css_stage_at_disclosure?: string;
  extraction_run_id?: string;
}

export interface SessionNarrativeContext {
  constellations: Array<{
    constellation_id: number;
    avg_strength: number;
    fragments: NarrativeFragment[];
  }>;
  totalFragmentCount: number;
  lastSessionFragments: NarrativeFragment[];
}

// ─── Functions ───────────────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const start = Date.now();
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    });
    console.log(`🕸️ [Narrative Web] generateEmbedding completed in ${Date.now() - start}ms`);
    return response.data[0].embedding;
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error generating embedding:', error);
    return [];
  }
}

export async function queryNarrativeWeb(
  userId: string,
  utterance: string,
  matchCount: number = 10,
  matchThreshold: number = 0.3
): Promise<NarrativeFragment[]> {
  try {
    const embedding = await generateEmbedding(utterance);
    if (embedding.length === 0) return [];

    const start = Date.now();
    const { data, error } = await supabase.rpc('match_narrative_fragments', {
      p_user_id: userId,
      p_query_embedding: JSON.stringify(embedding),
      p_match_count: matchCount,
      p_match_threshold: matchThreshold,
    });
    console.log(`🕸️ [Narrative Web] queryNarrativeWeb RPC completed in ${Date.now() - start}ms`);

    if (error) {
      console.error('🕸️ [Narrative Web] Error querying narrative web:', error);
      return [];
    }

    return (data as NarrativeFragment[]) || [];
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error in queryNarrativeWeb:', error);
    return [];
  }
}

export async function getResonanceNetwork(fragmentIds: string[]): Promise<ResonanceLink[]> {
  try {
    const start = Date.now();
    const { data, error } = await supabase.rpc('get_fragment_resonance_network', {
      p_fragment_ids: fragmentIds,
      p_min_strength: 0.4,
    });
    console.log(`🕸️ [Narrative Web] getResonanceNetwork RPC completed in ${Date.now() - start}ms`);

    if (error) {
      console.error('🕸️ [Narrative Web] Error getting resonance network:', error);
      return [];
    }

    return (data as ResonanceLink[]) || [];
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error in getResonanceNetwork:', error);
    return [];
  }
}

export async function getUserConstellations(
  userId: string,
  minStrength: number = 0.5,
  minClusterSize: number = 3
): Promise<Constellation[]> {
  try {
    const start = Date.now();
    const { data, error } = await supabase.rpc('get_user_constellations', {
      p_user_id: userId,
      p_min_strength: minStrength,
      p_min_cluster_size: minClusterSize,
    });
    console.log(`🕸️ [Narrative Web] getUserConstellations RPC completed in ${Date.now() - start}ms`);

    if (error) {
      console.error('🕸️ [Narrative Web] Error getting user constellations:', error);
      return [];
    }

    return (data as Constellation[]) || [];
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error in getUserConstellations:', error);
    return [];
  }
}

export async function findResonatingFragments(
  userId: string,
  utterance: string
): Promise<ResonanceResult> {
  const emptyResult: ResonanceResult = {
    matchedFragments: [],
    activeLinks: [],
    constellationFragments: [],
    isConstellationActive: false,
  };

  try {
    // Step 1: Find semantically similar fragments
    const matchedFragments = await queryNarrativeWeb(userId, utterance);
    if (matchedFragments.length === 0) return emptyResult;

    // Step 2: Get resonance network for matched fragments
    const fragmentIds = matchedFragments.map((f) => f.id);
    const activeLinks = await getResonanceNetwork(fragmentIds);

    // Step 3: Identify constellation fragments
    // A fragment is part of a constellation if it's connected to 2+ other matched fragments
    // with strength > 0.5
    const matchedIdSet = new Set(fragmentIds);
    const connectionCounts = new Map<string, number>();

    for (const link of activeLinks) {
      if (link.strength <= 0.5) continue;
      const aMatched = matchedIdSet.has(link.fragment_a_id);
      const bMatched = matchedIdSet.has(link.fragment_b_id);
      if (aMatched) {
        connectionCounts.set(link.fragment_a_id, (connectionCounts.get(link.fragment_a_id) || 0) + 1);
      }
      if (bMatched) {
        connectionCounts.set(link.fragment_b_id, (connectionCounts.get(link.fragment_b_id) || 0) + 1);
      }
    }

    const constellationFragmentIds = new Set<string>();
    for (const [fragmentId, count] of connectionCounts) {
      if (count >= 2) {
        constellationFragmentIds.add(fragmentId);
      }
    }

    const constellationFragments = matchedFragments.filter((f) =>
      constellationFragmentIds.has(f.id)
    );

    return {
      matchedFragments,
      activeLinks,
      constellationFragments,
      isConstellationActive: constellationFragments.length > 0,
    };
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error in findResonatingFragments:', error);
    return emptyResult;
  }
}

export async function storeFragment(fragment: NewNarrativeFragment): Promise<string | null> {
  try {
    const embedding = await generateEmbedding(fragment.content_summary);
    if (embedding.length === 0) return null;

    const start = Date.now();
    const { data, error } = await supabase
      .from('narrative_fragments')
      .insert({
        ...fragment,
        embedding: JSON.stringify(embedding),
      })
      .select('id')
      .single();
    console.log(`🕸️ [Narrative Web] storeFragment insert completed in ${Date.now() - start}ms`);

    if (error) {
      console.error('🕸️ [Narrative Web] Error storing fragment:', error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error in storeFragment:', error);
    return null;
  }
}

export async function strengthenResonanceLink(
  fragmentAId: string,
  fragmentBId: string,
  resonanceType: string,
  sessionId: string,
  detectedBy: string,
  strengthDelta: number = 0.1
): Promise<string | null> {
  try {
    const start = Date.now();
    const { data, error } = await supabase.rpc('upsert_resonance_link', {
      p_fragment_a_id: fragmentAId,
      p_fragment_b_id: fragmentBId,
      p_resonance_type: resonanceType,
      p_session_id: sessionId,
      p_detected_by: detectedBy,
      p_strength_delta: strengthDelta,
    });
    console.log(`🕸️ [Narrative Web] strengthenResonanceLink RPC completed in ${Date.now() - start}ms`);

    if (error) {
      console.error('🕸️ [Narrative Web] Error strengthening resonance link:', error);
      return null;
    }

    return (data as string) || null;
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error in strengthenResonanceLink:', error);
    return null;
  }
}

export async function loadSessionNarrativeContext(
  userId: string
): Promise<SessionNarrativeContext> {
  const emptyContext: SessionNarrativeContext = {
    constellations: [],
    totalFragmentCount: 0,
    lastSessionFragments: [],
  };

  try {
    // Get current constellation state
    const constellations = await getUserConstellations(userId);

    // Load full fragment details for each constellation
    const constellationDetails = await Promise.all(
      constellations.map(async (c) => {
        const start = Date.now();
        const { data, error } = await supabase
          .from('narrative_fragments')
          .select('*')
          .in('id', c.fragment_ids);
        console.log(`🕸️ [Narrative Web] loadSessionNarrativeContext constellation ${c.constellation_id} query completed in ${Date.now() - start}ms`);

        if (error) {
          console.error('🕸️ [Narrative Web] Error loading constellation fragments:', error);
          return {
            constellation_id: c.constellation_id,
            avg_strength: c.avg_strength,
            fragments: [] as NarrativeFragment[],
          };
        }

        return {
          constellation_id: c.constellation_id,
          avg_strength: c.avg_strength,
          fragments: (data as NarrativeFragment[]) || [],
        };
      })
    );

    // Get total fragment count for this user
    const countStart = Date.now();
    const { count, error: countError } = await supabase
      .from('narrative_fragments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    console.log(`🕸️ [Narrative Web] loadSessionNarrativeContext count query completed in ${Date.now() - countStart}ms`);

    if (countError) {
      console.error('🕸️ [Narrative Web] Error counting fragments:', countError);
    }

    // Get fragments from most recent session
    const recentStart = Date.now();
    const { data: recentFragments, error: recentError } = await supabase
      .from('narrative_fragments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    console.log(`🕸️ [Narrative Web] loadSessionNarrativeContext recent fragments query completed in ${Date.now() - recentStart}ms`);

    if (recentError) {
      console.error('🕸️ [Narrative Web] Error loading recent fragments:', recentError);
    }

    return {
      constellations: constellationDetails,
      totalFragmentCount: count || 0,
      lastSessionFragments: (recentFragments as NarrativeFragment[]) || [],
    };
  } catch (error) {
    console.error('🕸️ [Narrative Web] Error in loadSessionNarrativeContext:', error);
    return emptyContext;
  }
}
