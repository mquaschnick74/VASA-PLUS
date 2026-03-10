// server/services/user-content-service.ts
// Service for processing user-uploaded content (notes, documents) into the RAG pipeline

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabase-service';
import { MASTER_PC_ANALYST_PROMPT } from '../prompts/master-pc-analyst';

const openai = new OpenAI();
const anthropic = new Anthropic();

// Limits
const MAX_CONTENT_PER_USER = 20;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

interface ProcessingResult {
  success: boolean;
  chunkCount?: number;
  error?: string;
}

/**
 * Chunk text into smaller pieces with overlap
 * Uses the same algorithm as ingest-knowledge.ts
 */
function chunkText(content: string): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara) continue;

    if ((currentChunk + trimmedPara).length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep some overlap
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / 5));
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
 * Parse ChatGPT JSON export format
 * Extracts conversation turns and formats them as readable text
 */
function parseChatGPTExport(jsonContent: string): string {
  try {
    const data = JSON.parse(jsonContent);
    const lines: string[] = [];

    // ChatGPT export format: array of conversations
    const conversations = Array.isArray(data) ? data : [data];

    for (const conversation of conversations) {
      if (conversation.title) {
        lines.push(`## ${conversation.title}\n`);
      }

      // The mapping object contains all message nodes
      if (conversation.mapping) {
        const messages: Array<{ role: string; content: string; timestamp?: number }> = [];

        for (const nodeId in conversation.mapping) {
          const node = conversation.mapping[nodeId];
          const message = node.message;

          if (message && message.content && message.content.parts) {
            const role = message.author?.role || 'unknown';
            const content = message.content.parts
              .filter((part: any) => typeof part === 'string')
              .join('\n');

            if (content.trim()) {
              messages.push({
                role,
                content: content.trim(),
                timestamp: message.create_time
              });
            }
          }
        }

        // Sort by timestamp if available
        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // Format as conversation
        for (const msg of messages) {
          const speaker = msg.role === 'user' ? 'User' : 'Assistant';
          lines.push(`${speaker}: ${msg.content}\n`);
        }
      }

      lines.push('\n---\n');
    }

    return lines.join('\n');
  } catch (error) {
    console.error('[UserContent] Failed to parse ChatGPT export:', error);
    // Return raw content if parsing fails
    return jsonContent;
  }
}

/**
 * Extract text from a .docx file buffer
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
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
 * Process content: chunk, embed, and store in knowledge_chunks
 * If analysisMode is 'analyze', also triggers PCA analysis and stores in therapeutic_context
 * @param contentId - The user_content record ID
 * @param authUserId - The user's Supabase auth ID (for knowledge_chunks.user_id)
 * @param analysisMode - 'analyze' triggers PCA analysis, 'record' just stores chunks
 */
export async function processContent(
  contentId: string,
  authUserId: string,
  analysisMode: 'analyze' | 'record' = 'record'
): Promise<ProcessingResult> {
  console.log(`[UserContent] Processing content ${contentId} for user ${authUserId}, mode: ${analysisMode}`);

  try {
    // Update status to processing
    await supabase
      .from('user_content')
      .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', contentId);

    // Fetch the content record
    const { data: content, error: fetchError } = await supabase
      .from('user_content')
      .select('*')
      .eq('id', contentId)
      .single();

    if (fetchError || !content) {
      throw new Error(`Failed to fetch content: ${fetchError?.message || 'Not found'}`);
    }

    let textToProcess = content.raw_text || '';

    // Parse based on file type
    if (content.file_type === 'json') {
      textToProcess = parseChatGPTExport(textToProcess);
    }
    // For .txt and .md, use raw text as-is

    if (!textToProcess || textToProcess.trim().length < 20) {
      throw new Error('Content too short or empty');
    }

    // Chunk the text
    const chunks = chunkText(textToProcess);
    console.log(`[UserContent] Created ${chunks.length} chunks for content ${contentId}`);

    if (chunks.length === 0) {
      throw new Error('No chunks created from content');
    }

    // Generate embeddings and insert chunks
    let insertedCount = 0;
    const title = content.title || content.original_filename || 'User content';

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        const embedding = await generateEmbedding(chunk);

        const { error: insertError } = await supabase.from('knowledge_chunks').insert({
          content: chunk,
          embedding: embedding,
          metadata: {
            type: 'user_content',
            source: title,
            tags: ['user-submitted'],
            content_type: content.content_type,
            original_source: content.source
          },
          source_document: `user-content/${contentId}`,
          chunk_index: i,
          user_id: authUserId,
          artifact_id: contentId
        });

        if (insertError) {
          console.error(`[UserContent] Failed to insert chunk ${i}:`, insertError.message);
        } else {
          insertedCount++;
        }

        // Rate limiting for OpenAI
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (chunkError: any) {
        console.error(`[UserContent] Error processing chunk ${i}:`, chunkError.message);
      }
    }

    // Update content record with chunking success
    await supabase
      .from('user_content')
      .update({
        chunk_count: insertedCount,
        processing_status: analysisMode === 'analyze' ? 'analyzing' : 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', contentId);

    console.log(`[UserContent] Successfully processed ${insertedCount}/${chunks.length} chunks for content ${contentId}`);

    // If analysis mode, trigger PCA analysis
    if (analysisMode === 'analyze') {
      try {
        console.log(`[UserContent] Triggering PCA analysis for content ${contentId}`);
        await triggerUploadAnalysis(contentId, content.user_id, textToProcess, title);

        // Update status to completed after analysis
        await supabase
          .from('user_content')
          .update({
            processing_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', contentId);

        console.log(`[UserContent] PCA analysis completed for content ${contentId}`);
      } catch (analysisError: any) {
        console.error(`[UserContent] PCA analysis failed for ${contentId}:`, analysisError.message);
        // Don't fail the whole process - chunks were saved successfully
        // Just mark as completed (analysis failure is logged but non-fatal)
        await supabase
          .from('user_content')
          .update({
            processing_status: 'completed',
            processing_error: `Analysis failed: ${analysisError.message}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', contentId);
      }
    }

    return { success: true, chunkCount: insertedCount };

  } catch (error: any) {
    console.error(`[UserContent] Processing failed for ${contentId}:`, error.message);

    // Update content record with failure
    await supabase
      .from('user_content')
      .update({
        processing_status: 'failed',
        processing_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', contentId);

    return { success: false, error: error.message };
  }
}

/**
 * Get user's content list
 */
export async function getUserContentList(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('user_content')
    .select('id, title, content_type, source, processing_status, chunk_count, created_at, original_filename, processing_error, analysis_mode')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[UserContent] Failed to fetch content list:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Delete user content and associated chunks (chunks cascade-delete via FK)
 */
export async function deleteUserContent(contentId: string, userId: string): Promise<boolean> {
  // Verify ownership
  const { data: content, error: fetchError } = await supabase
    .from('user_content')
    .select('id')
    .eq('id', contentId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !content) {
    console.error('[UserContent] Content not found or not owned by user');
    return false;
  }

  // Delete the content (chunks cascade-delete via FK constraint)
  const { error: deleteError } = await supabase
    .from('user_content')
    .delete()
    .eq('id', contentId);

  if (deleteError) {
    console.error('[UserContent] Failed to delete content:', deleteError.message);
    return false;
  }

  console.log(`[UserContent] Deleted content ${contentId}`);
  return true;
}

/**
 * Get user's content count for limit enforcement
 */
export async function getUserContentCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_content')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error('[UserContent] Failed to get content count:', error.message);
    return 0;
  }

  return count || 0;
}

/**
 * Check if user can add more content
 */
export async function canUserAddContent(userId: string): Promise<boolean> {
  const count = await getUserContentCount(userId);
  return count < MAX_CONTENT_PER_USER;
}

/**
 * Create a user content record
 */
export async function createUserContent(params: {
  userId: string;
  contentType: 'note' | 'document';
  source: string;
  title?: string;
  originalFilename?: string;
  rawText: string;
  fileType?: string;
  fileSize?: number;
  analysisMode?: 'analyze' | 'record';
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('user_content')
    .insert({
      user_id: params.userId,
      content_type: params.contentType,
      source: params.source,
      title: params.title,
      original_filename: params.originalFilename,
      raw_text: params.rawText,
      file_type: params.fileType,
      file_size: params.fileSize,
      processing_status: 'pending',
      analysis_mode: params.analysisMode || 'record'
    })
    .select('id')
    .single();

  if (error) {
    console.error('[UserContent] Failed to create content record:', error.message);
    return null;
  }

  return data;
}

/**
 * Trigger PCA analysis on uploaded content
 * Uses the Master PC Analyst prompt adapted for uploaded content
 * Stores result in therapeutic_context with context_type='upload_analysis'
 */
async function triggerUploadAnalysis(
  contentId: string,
  userId: string,
  rawText: string,
  title: string
): Promise<void> {
  console.log(`[UploadAnalysis] Starting PCA analysis for content ${contentId}`);

  // Build the analysis prompt for uploaded content
  const uploadAnalysisPrompt = `${MASTER_PC_ANALYST_PROMPT}

You are analyzing content that a therapy client has shared for discussion with their VASA therapeutic agent.
This is NOT a session transcript - it is content the user uploaded (a conversation, journal entry, or other personal content).

Analyze the following uploaded content and produce:

1. A clinical interpretation using the PCP/PCA framework:
   - Perceptual Structure Assessment (Real/Symbolic/Imaginary dominance)
   - CVDC patterns detected (contradictions the person is holding)
   - Register analysis (which register dominates)
   - CSS-relevant patterns (but do NOT assign or recommend CSS stage changes - only live sessions can progress CSS)
   - Symbolic functioning assessment

2. Extract 2-3 KEY VERBATIM QUOTES from the content that are therapeutically significant - quotes the agent should reference when discussing this material with the user.

3. A brief summary of what the agent should proactively explore with the user regarding this content.

IMPORTANT CONSTRAINTS:
- This analysis is for the AGENT, not the user. The user will NEVER see this output.
- Do NOT recommend CSS stage changes. Upload analysis cannot move CSS stage - only direct sessions can.
- Focus on patterns the agent should explore in the next session.
- Keep the analysis concise - under 1500 characters for the clinical interpretation.

FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:

===== UPLOAD ANALYSIS: ${title} =====

## CLINICAL INTERPRETATION
[Your PCP/PCA analysis here - be concise]

## KEY QUOTES FOR SESSION
1. "[Exact quote from the content]"
2. "[Exact quote from the content]"
3. "[Optional third quote if highly relevant]"

## AGENT GUIDANCE
[2-3 sentences on what the agent should explore with the user about this content]

===== END ANALYSIS =====

--- CONTENT TO ANALYZE ---
${rawText.substring(0, 15000)}
--- END CONTENT ---`;

  try {
    // Call Claude API for analysis
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: uploadAnalysisPrompt
        }
      ]
    });

    const analysisText = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    if (!analysisText) {
      throw new Error('Empty response from Claude API');
    }

    // Extract key quotes from the analysis
    const quotesMatch = analysisText.match(/## KEY QUOTES FOR SESSION\n([\s\S]*?)(?=\n## |===== END)/);
    const quotes: string[] = [];
    if (quotesMatch) {
      const quotesSection = quotesMatch[1];
      const quoteMatches = quotesSection.matchAll(/\d+\.\s*"([^"]+)"/g);
      for (const match of quoteMatches) {
        quotes.push(match[1]);
      }
    }

    // Store in therapeutic_context with proper metadata
    const { error: insertError } = await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        context_type: 'upload_analysis',
        content: analysisText,
        confidence: 0.85,
        importance: 8,
        metadata: {
          source_content_id: contentId,
          analysis_status: 'fresh',
          addressed_in_session: false,
          key_quotes: quotes,
          title: title
        }
      });

    if (insertError) {
      console.error('[UploadAnalysis] Failed to store analysis:', insertError.message);
      throw insertError;
    }

    console.log(`[UploadAnalysis] Successfully stored analysis for content ${contentId} with ${quotes.length} key quotes`);

  } catch (error: any) {
    console.error('[UploadAnalysis] Analysis failed:', error.message);
    throw error;
  }
}

// Export the docx extraction function for use in routes
export { extractDocxText };
