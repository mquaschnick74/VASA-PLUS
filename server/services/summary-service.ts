import { supabase } from './supabase-service';
import { storeSessionContext } from './memory-service';  // Keep this for backward compatibility
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY
});

interface SessionSummaryData {
  userId: string;
  callId: string;
  transcript?: string;
  cssPatterns?: any;
  agentName: string;
  duration: number;
}

/**
 * Generate narrative-rich AI summaries that preserve user's voice
 * Creates two summaries: one for greeting context, one for clinical notes
 */
export async function generateEnhancedSessionSummary(data: SessionSummaryData): Promise<string> {
  const { userId, callId, transcript, cssPatterns, agentName, duration } = data;

  console.log(`🎯 Generating AI-powered summary for call ${callId}`);

  // If no transcript, create minimal summary
  if (!transcript || transcript.length < 50) {
    const minimalSummary = `Session with ${agentName} lasted ${Math.floor(duration / 60)} minutes.`;
    await storeSummaries(userId, callId, minimalSummary, minimalSummary, agentName);
    return minimalSummary;
  }

  try {
    // Generate AI summaries
    const { greetingContext, clinicalNotes } = await generateAISummaries(
      transcript,
      cssPatterns,
      agentName,
      duration
    );

    // Store both summaries
    await storeSummaries(userId, callId, clinicalNotes, greetingContext, agentName);

    console.log('✅ AI summaries generated and stored successfully');
    return greetingContext;

  } catch (error) {
    console.error('❌ AI summary generation failed, using fallback:', error);

    // Fallback to narrative extraction
    const fallbackSummary = await extractNarrativeFromTranscript(
      transcript,
      cssPatterns,
      agentName,
      duration
    );

    await storeSummaries(userId, callId, fallbackSummary, fallbackSummary, agentName);
    return fallbackSummary;
  }
}

/**
 * Generate AI summaries using OpenAI
 */
async function generateAISummaries(
  transcript: string,
  cssPatterns: any,
  agentName: string,
  duration: number
): Promise<{ greetingContext: string; clinicalNotes: string }> {

  // Prepare CSS context if available
  let cssContext = '';
  if (cssPatterns) {
    if (cssPatterns.cvdcPatterns?.length > 0) {
      cssContext += `\nContradictions detected: ${cssPatterns.cvdcPatterns[0]}`;
    }
    if (cssPatterns.ibmPatterns?.length > 0) {
      cssContext += `\nIntention-behavior gaps: ${cssPatterns.ibmPatterns[0]}`;
    }
    if (cssPatterns.currentStage) {
      cssContext += `\nTherapeutic stage: ${cssPatterns.currentStage}`;
    }
  }

  // Prompt for greeting context (what agents will use)
  const greetingPrompt = `From this therapy session transcript, create a narrative summary that preserves the user's actual story and words.

This summary will be used by the therapeutic agent to create a personalized greeting in the next session.

Focus on:
- The user's specific phrases and expressions (preserve impactful quotes)
- Their ongoing struggles in their own words
- Contradictions or tensions they expressed
- Unique metaphors or descriptions they used
- Specific situations they're navigating (work, relationships, etc.)
- Any moments of insight or shift

Write as if you're noting what to remember for the next conversation.
Keep their narrative voice alive. Use their actual words when impactful.
${cssContext}

Session was with ${agentName} and lasted ${Math.floor(duration / 60)} minutes.

Transcript:
${transcript.substring(0, 4000)} ${transcript.length > 4000 ? '...[transcript continues]' : ''}

Create a narrative summary (2-3 sentences) that captures their story:`;

  // Prompt for clinical notes (for records)
  const clinicalPrompt = `From this therapy session, create brief clinical notes.

Include:
- Key themes and patterns
- Emotional states presented
- Behavioral patterns observed
- Any safety concerns
${cssContext}

Session with ${agentName}, duration: ${Math.floor(duration / 60)} minutes.

Transcript:
${transcript.substring(0, 4000)} ${transcript.length > 4000 ? '...[transcript continues]' : ''}

Clinical notes (2-3 sentences):`;

  try {
    // Generate both summaries in parallel
    const [greetingResponse, clinicalResponse] = await Promise.all([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a therapeutic session note-taker focused on preserving narrative continuity and the user\'s authentic voice.'
          },
          {
            role: 'user',
            content: greetingPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
        timeout: 5000
      }),
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a clinical psychologist creating concise session notes.'
          },
          {
            role: 'user',
            content: clinicalPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 150,
        timeout: 5000
      })
    ]);

    const greetingContext = greetingResponse.choices[0]?.message?.content || '';
    const clinicalNotes = clinicalResponse.choices[0]?.message?.content || '';

    console.log('📝 AI Greeting Context:', greetingContext.substring(0, 100) + '...');
    console.log('📝 AI Clinical Notes:', clinicalNotes.substring(0, 100) + '...');

    return {
      greetingContext: greetingContext.trim(),
      clinicalNotes: clinicalNotes.trim()
    };

  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}

/**
 * Fallback: Extract narrative directly from transcript
 */
async function extractNarrativeFromTranscript(
  transcript: string,
  cssPatterns: any,
  agentName: string,
  duration: number
): Promise<string> {
  console.log('📝 Using fallback narrative extraction');

  // Extract user statements
  const userStatements: string[] = [];
  const lines = transcript.split('\n');

  for (const line of lines) {
    if (line.toLowerCase().includes('user:')) {
      const userText = line.substring(line.indexOf(':') + 1).trim();
      if (userText.length > 20 && userText.length < 200) {
        userStatements.push(userText);
      }
    }
  }

  // Build narrative from actual user statements
  let narrative = '';

  // Add first few meaningful statements
  const meaningfulStatements = userStatements
    .filter(s => !s.toLowerCase().includes('yeah') && 
                 !s.toLowerCase().includes('okay') &&
                 !s.toLowerCase().includes('um') &&
                 s.length > 30)
    .slice(0, 3);

  if (meaningfulStatements.length > 0) {
    narrative = `User shared: "${meaningfulStatements[0]}"`;
    if (meaningfulStatements[1]) {
      narrative += ` They also mentioned: "${meaningfulStatements[1]}"`;
    }
  } else {
    narrative = `Session with ${agentName} lasted ${Math.floor(duration / 60)} minutes.`;
  }

  // Add CSS patterns if detected
  if (cssPatterns?.cvdcPatterns?.length > 0) {
    narrative += ` Expressed contradiction: ${cssPatterns.cvdcPatterns[0]}.`;
  }

  return narrative;
}

/**
 * Store summaries in database
 * Now uses storeSessionContext from memory-service for the clinical notes
 */
async function storeSummaries(
  userId: string,
  callId: string,
  clinicalNotes: string,
  greetingContext: string,
  agentName: string
): Promise<void> {
  try {
    // Use the existing storeSessionContext for backward compatibility
    await storeSessionContext(userId, callId, clinicalNotes, 'call_summary', agentName);

    // Store the greeting context as conversational_summary
    const { error } = await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        call_id: callId,
        context_type: 'conversational_summary',
        content: greetingContext,
        confidence: 0.85,
        importance: 8,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('❌ Failed to store conversational summary:', error);
      throw error;
    }

    console.log('✅ Stored both call_summary and conversational_summary');
  } catch (err) {
    console.error('❌ Error storing summaries:', err);
    throw err;
  }
}

// Export for backward compatibility if needed elsewhere
export { storeSessionContext };

// For backward compatibility
export function formatForConversation(summary: string): string {
  return summary; // No longer needed with AI summaries
}