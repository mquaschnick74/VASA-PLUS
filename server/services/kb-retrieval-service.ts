import { supabase } from './supabase-service';

interface KBDocument {
  id: string;
  document_id: string;
  document_type: string;
  title: string;
  content: string;
  metadata: any;
  trigger_keywords: string[];
  css_stage: string | null;
  pattern_type: string | null;
  crisis_type: string | null;
  priority: number;
  immediate_inject: boolean;
  agent_recommendation: string | null;
  token_count: number;
}

interface RetrieveParams {
  userId: string;
  cssStage?: string;
  baseline?: boolean;
  keywords?: string[];
  agentName?: string;
}

interface RetrieveResult {
  protocols: string;
  documentCount: number;
}

/**
 * Main retrieval function - fetches relevant KB documents and formats for system prompt
 */
export async function retrieve(params: RetrieveParams): Promise<RetrieveResult> {
  const { userId, cssStage, baseline = false, keywords = [], agentName } = params;

  try {
    console.log(`📚 KB Retrieval: userId=${userId}, cssStage=${cssStage}, baseline=${baseline}, keywords=${keywords.length}`);

    // Fetch all active documents from database
    const { data: documents, error } = await supabase
      .from('knowledge_base_documents')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false }); // Highest priority first

    if (error) {
      console.error('❌ KB retrieval error:', error);
      return { protocols: '', documentCount: 0 };
    }

    if (!documents || documents.length === 0) {
      console.warn('⚠️ No KB documents found in database');
      return { protocols: '', documentCount: 0 };
    }

    console.log(`📊 Found ${documents.length} total KB documents`);

    let filteredDocs = documents as KBDocument[];

    // STEP 1: Handle baseline retrieval (call-start)
    if (baseline) {
      filteredDocs = filterBaseline(filteredDocs);
      console.log(`📋 Baseline filter: ${filteredDocs.length} documents`);
    }

    // STEP 2: Filter by CSS stage if provided
    if (cssStage) {
      filteredDocs = filterByCSSStage(filteredDocs, cssStage);
      console.log(`🎯 CSS stage filter (${cssStage}): ${filteredDocs.length} documents`);
    }

    // STEP 3: Match keywords if provided
    if (keywords.length > 0) {
      filteredDocs = matchKeywords(filteredDocs, keywords);
      console.log(`🔑 Keyword match: ${filteredDocs.length} documents`);
    }

    // STEP 4: Filter by agent recommendation if provided
    if (agentName) {
      filteredDocs = filterByAgent(filteredDocs, agentName);
      console.log(`👤 Agent filter (${agentName}): ${filteredDocs.length} documents`);
    }

    // STEP 5: Separate crisis protocols (priority 9-10) from regular protocols
    const crisisProtocols = filteredDocs.filter(doc => doc.priority >= 9);
    const regularProtocols = filteredDocs.filter(doc => doc.priority < 9);

    console.log(`🚨 Crisis protocols: ${crisisProtocols.length}`);
    console.log(`📖 Regular protocols: ${regularProtocols.length}`);

    // STEP 6: Apply token budget (1500-2500 tokens max)
    const selectedDocs = applyTokenBudget(crisisProtocols, regularProtocols, 2500);

    console.log(`✅ Selected ${selectedDocs.length} documents (total tokens: ${calculateTotalTokens(selectedDocs)})`);

    // STEP 7: Format for system prompt
    const formatted = formatForSystemPrompt(selectedDocs);

    return {
      protocols: formatted,
      documentCount: selectedDocs.length
    };

  } catch (error) {
    console.error('❌ KB retrieval failed:', error);
    return { protocols: '', documentCount: 0 };
  }
}

/**
 * Filter for baseline protocols (first session, continuity)
 */
function filterBaseline(documents: KBDocument[]): KBDocument[] {
  return documents.filter(doc => {
    const docType = doc.document_type;
    // Include procedural protocols for call-start
    return docType === 'procedural_protocol' || 
           docType === 'crisis_protocol'; // Always include crisis protocols
  });
}

/**
 * Filter by CSS stage (null stage = applies to all stages)
 */
function filterByCSSStage(documents: KBDocument[], cssStage: string): KBDocument[] {
  return documents.filter(doc => {
    // Document with null css_stage applies to all stages
    if (!doc.css_stage) return true;

    // Exact match with current CSS stage
    return doc.css_stage.toLowerCase() === cssStage.toLowerCase();
  });
}

/**
 * Match keywords (partial, case-insensitive)
 */
function matchKeywords(documents: KBDocument[], keywords: string[]): KBDocument[] {
  if (keywords.length === 0) return documents;

  return documents.filter(doc => {
    // Get trigger keywords from document
    const triggerKeywords = doc.trigger_keywords || [];

    if (triggerKeywords.length === 0) return false;

    // Check if any user keyword matches any trigger keyword (partial match)
    return keywords.some(userKeyword => {
      const userKeywordLower = userKeyword.toLowerCase();

      return triggerKeywords.some(triggerKeyword => {
        const triggerKeywordLower = triggerKeyword.toLowerCase();

        // Partial match in either direction
        return triggerKeywordLower.includes(userKeywordLower) ||
               userKeywordLower.includes(triggerKeywordLower);
      });
    });
  });
}

/**
 * Filter by agent recommendation (null = any agent)
 */
function filterByAgent(documents: KBDocument[], agentName: string): KBDocument[] {
  return documents.filter(doc => {
    // Document with null agent_recommendation applies to all agents
    if (!doc.agent_recommendation) return true;

    // Match current agent
    return doc.agent_recommendation.toLowerCase() === agentName.toLowerCase();
  });
}

/**
 * Apply token budget - crisis protocols always included, then fit regular protocols
 */
function applyTokenBudget(
  crisisProtocols: KBDocument[], 
  regularProtocols: KBDocument[], 
  maxTokens: number
): KBDocument[] {
  const selected: KBDocument[] = [];
  let currentTokens = 0;

  // ALWAYS include crisis protocols (non-negotiable)
  for (const doc of crisisProtocols) {
    selected.push(doc);
    currentTokens += doc.token_count;
  }

  console.log(`🚨 Crisis protocols use ${currentTokens} tokens`);

  // Add regular protocols by priority until budget exhausted
  const sortedRegular = [...regularProtocols].sort((a, b) => b.priority - a.priority);

  for (const doc of sortedRegular) {
    if (currentTokens + doc.token_count <= maxTokens) {
      selected.push(doc);
      currentTokens += doc.token_count;
    } else {
      console.log(`⏭️ Skipping "${doc.title}" (would exceed token budget)`);
    }
  }

  return selected;
}

/**
 * Calculate total tokens for selected documents
 */
function calculateTotalTokens(documents: KBDocument[]): number {
  return documents.reduce((sum, doc) => sum + doc.token_count, 0);
}

/**
 * Format documents for system prompt
 */
function formatForSystemPrompt(documents: KBDocument[]): string {
  if (documents.length === 0) return '';

  let formatted = '';

  // Group by document type for better organization
  const byType: { [key: string]: KBDocument[] } = {};

  documents.forEach(doc => {
    if (!byType[doc.document_type]) {
      byType[doc.document_type] = [];
    }
    byType[doc.document_type].push(doc);
  });

  // Format each type section
  const typeOrder = ['crisis_protocol', 'procedural_protocol', 'css_stage_guide', 'pattern_intervention'];

  for (const type of typeOrder) {
    const docs = byType[type];
    if (!docs || docs.length === 0) continue;

    formatted += `\n## ${formatTypeName(type)}\n\n`;

    docs.forEach(doc => {
      formatted += `### ${doc.title}\n\n`;
      formatted += `${doc.content}\n\n`;
      formatted += `---\n\n`;
    });
  }

  return formatted.trim();
}

/**
 * Format document type name for display
 */
function formatTypeName(type: string): string {
  const map: { [key: string]: string } = {
    'crisis_protocol': 'CRISIS PROTOCOLS',
    'css_stage_guide': 'CSS STAGE GUIDANCE',
    'pattern_intervention': 'PATTERN INTERVENTIONS',
    'procedural_protocol': 'PROCEDURAL GUIDANCE'
  };

  return map[type] || type.toUpperCase().replace('_', ' ');
}

/**
 * Helper function to extract keywords from user message
 * Used in conversation-update webhook
 */
export function extractKeywordsFromMessage(message: string): string[] {
  // Remove punctuation and split into words
  const words = message
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2); // Only words longer than 2 chars

  // Remove common stop words
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one',
    'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old',
    'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'
  ]);

  return words.filter(word => !stopWords.has(word));
}