// Enhanced Memory Service - Rich therapeutic context with specific quotes and natural acknowledgments
import { supabase } from './supabase-service';
import { detectCSSPatterns, CSSPatterns } from './css-pattern-service';
import { getCSSProgressionContext } from './summary-service';

interface SessionSummary {
  id: string;
  callId: string;
  date: string;
  duration: number;
  transcript: string;
  summary: string;
  cssStage: string;
  patterns: CSSPatterns;
  isMeaningful: boolean;
}

interface TherapeuticContext {
  sessionCount: number;
  lastMeaningfulSession: SessionSummary | null;
  recentSessions: SessionSummary[];
  dominantPatterns: string[];
  keyInsights: string[];
  currentCSSStage: string;
  verbalAcknowledgment: string;
}

/**
 * Determines if a session contains meaningful therapeutic content
 * UPDATED: Lowered thresholds to capture Jordan's existing rich content
 */
function isMeaningfulSession(session: any, patterns: CSSPatterns): boolean {
  console.log(`🔍 Checking meaningful session for ${session.call_id}:`);
  console.log(`  Duration: ${session.duration_seconds || 0} seconds`);
  console.log(`  Patterns: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}, Thend=${patterns.thendIndicators.length}, CYVC=${patterns.cyvcPatterns.length}`);

  // LOWERED: Duration check - now 60 seconds instead of 120
  if (session.duration_seconds && session.duration_seconds >= 60) {
    console.log(`  ✅ Meaningful: Duration >= 60 seconds`);
    return true;
  }

  // CSS patterns detected
  const totalPatterns = patterns.cvdcPatterns.length + 
                       patterns.ibmPatterns.length + 
                       patterns.thendIndicators.length + 
                       patterns.cyvcPatterns.length;

  if (totalPatterns > 0) {
    console.log(`  ✅ Meaningful: ${totalPatterns} CSS patterns detected`);
    return true;
  }

  // LOWERED: Transcript length check - now 200 characters instead of 500
  if (session.text && session.text.length > 200) {
    console.log(`  ✅ Meaningful: Transcript length ${session.text.length} characters`);
    return true;
  }

  // NEW: Check therapeutic_context for insights
  if (session.hasTherapeuticInsights) {
    console.log(`  ✅ Meaningful: Has therapeutic insights`);
    return true;
  }

  // NEW: Check for emotional language patterns (even without formal CSS detection)
  if (session.text) {
    const emotionalKeywords = [
      'electric', 'buzzing', 'invincible', 'manic', 'contradiction', 'tension',
      'creative', 'overwhelmed', 'scattered', 'pulled', 'part of me',
      'but also', 'want to', 'but end up', 'frustrated', 'excited'
    ];

    const foundKeywords = emotionalKeywords.filter(keyword => 
      session.text.toLowerCase().includes(keyword.toLowerCase())
    );

    if (foundKeywords.length >= 2) {
      console.log(`  ✅ Meaningful: Found emotional keywords: ${foundKeywords.join(', ')}`);
      return true;
    }
  }

  console.log(`  ❌ Not meaningful: No criteria met`);
  return false;
}

/**
 * Extracts key therapeutic quotes from transcript
 */
function extractKeyQuotes(transcript: string, patterns: CSSPatterns): string[] {
  const quotes: string[] = [];

  // Guard against undefined transcript
  if (!transcript) {
    return quotes;
  }

  // Extract CVDC quotes (contradictions)
  patterns.cvdcPatterns.forEach(pattern => {
    const quote = pattern.substring(0, 80) + (pattern.length > 80 ? "..." : "");
    quotes.push(`"${quote}"`);
  });

  // Extract IBM quotes (behavioral gaps)
  patterns.ibmPatterns.forEach(pattern => {
    const quote = pattern.substring(0, 80) + (pattern.length > 80 ? "..." : "");
    quotes.push(`"${quote}"`);
  });

  // Extract physical/somatic descriptions
  const somaticPatterns = [
    /chest.*?(?:tight|pressure|empty|heavy|ache)/gi,
    /shoulder.*?(?:tense|tight|up|raised)/gi,
    /stomach.*?(?:knot|tight|churn|flip)/gi,
    /throat.*?(?:tight|close|constrict)/gi,
    /hands.*?(?:clench|fist|shake|tremble)/gi,
    /breath.*?(?:shallow|held|tight|catch)/gi
  ];

  somaticPatterns.forEach(pattern => {
    const matches = transcript.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const quote = match.substring(0, 60) + (match.length > 60 ? "..." : "");
        quotes.push(`"${quote}"`);
      });
    }
  });

  return quotes.slice(0, 3); // Limit to most significant quotes
}

/**
 * Extracts specific contradictions in user's own words
 */
function extractContradictions(patterns: CSSPatterns): string[] {
  const contradictions: string[] = [];

  patterns.cvdcPatterns.forEach(pattern => {
    // Look for classic contradiction structures
    if (pattern.includes('but')) {
      const parts = pattern.split('but');
      if (parts.length === 2) {
        const contradiction = `${parts[0].trim()} BUT ${parts[1].trim()}`;
        contradictions.push(contradiction);
      }
    }

    if (pattern.includes('part of me')) {
      contradictions.push(pattern);
    }
  });

  return contradictions.slice(0, 2); // Most significant contradictions
}

/**
 * Generates enhanced therapeutic summary with specific details
 */
function generateEnhancedSummary(
  session: any, 
  patterns: CSSPatterns, 
  firstName: string,
  transcript: string = ''
): string {
  const keyQuotes = extractKeyQuotes(transcript, patterns);
  const contradictions = extractContradictions(patterns);

  let summary = `${firstName} `;

  // Add contradiction details
  if (contradictions.length > 0) {
    summary += `explored internal conflict: ${contradictions[0]}. `;
  }

  // Add key quotes/themes
  if (keyQuotes.length > 0) {
    summary += `Key expressions: ${keyQuotes.join(', ')}. `;
  }

  // Add CSS stage context
  if (patterns.currentStage !== 'pointed_origin') {
    summary += `Therapeutic progression: ${patterns.currentStage} stage. `;
  }

  // Add pattern summary
  const patternSummary = [];
  if (patterns.cvdcPatterns.length > 0) patternSummary.push(`${patterns.cvdcPatterns.length} contradictions`);
  if (patterns.ibmPatterns.length > 0) patternSummary.push(`${patterns.ibmPatterns.length} behavioral gaps`);
  if (patterns.thendIndicators.length > 0) patternSummary.push(`${patterns.thendIndicators.length} integration moments`);

  if (patternSummary.length > 0) {
    summary += `Patterns: ${patternSummary.join(', ')}.`;
  }

  return summary.trim();
}

/**
 * Truncates text at word boundary to avoid cutting words mid-sentence
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  // If we found a space, truncate there; otherwise take the whole maxLength
  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex);
  }

  return truncated;
}

/**
 * Creates natural verbal acknowledgment for returning sessions
 */
function createVerbalAcknowledgment(
  firstName: string, 
  lastSession: SessionSummary | null,
  agentName: string,
  cssProgressions?: any[]
): string {
  // If we have CSS progressions data, use it for specific acknowledgment
  if (cssProgressions && cssProgressions.length > 0) {
    const latest = cssProgressions[0];
    let acknowledgment = `Hello ${firstName}, `;
    
    // Reference the specific trigger content or stage transition
    if (latest.trigger_content) {
      const trigger = truncateAtWordBoundary(latest.trigger_content, 60);
      
      // Stage-specific acknowledgments
      if (latest.to_stage === 'suspension') {
        acknowledgment += `last time you reached that place of holding both truths - "${trigger}". `;
      } else if (latest.to_stage === 'focus_bind') {
        acknowledgment += `you were working with "${trigger}". `;
      } else if (latest.to_stage === 'pointed_origin' && latest.from_stage === 'suspension') {
        acknowledgment += `I noticed things felt intense when you said "${trigger}". `;
      } else {
        acknowledgment += `you shared "${trigger}". `;
      }
    } else {
      acknowledgment += `good to reconnect. `;
    }
    
    // Agent-specific follow-up based on current stage
    switch (agentName.toLowerCase()) {
      case 'sarah':
        if (latest.to_stage === 'suspension') {
          acknowledgment += `How are you holding those contradictions today?`;
        } else if (latest.to_stage === 'pointed_origin') {
          acknowledgment += `What feelings are most alive for you right now?`;
        } else {
          acknowledgment += `What emotional truth wants to emerge today?`;
        }
        break;
      case 'mathew':
        if (latest.trigger_content && latest.trigger_content.includes('but')) {
          acknowledgment += `Has that intention-behavior gap shifted?`;
        } else {
          acknowledgment += `What patterns are you noticing now?`;
        }
        break;
      case 'marcus':
        acknowledgment += `How has that tension been evolving?`;
        break;
      case 'zhanna':
        acknowledgment += `Where does that live in your body today?`;
        break;
      default:
        acknowledgment += `What's present for you now?`;
    }
    
    return acknowledgment;
  }
  
  // Fallback to transcript-based acknowledgment
  if (!lastSession || !lastSession.isMeaningful) {
    return `Hello ${firstName}, good to connect again. What's most present for you today?`;
  }

  const contradictions = extractContradictions(lastSession.patterns);
  const keyQuotes = extractKeyQuotes(lastSession.transcript, lastSession.patterns);

  let acknowledgment = `Hello ${firstName}, good to connect again. `;

  // Reference specific contradiction or theme
  if (contradictions.length > 0) {
    const contradiction = contradictions[0];
    if (contradiction.includes('part of me')) {
      acknowledgment += `Last time you were exploring that internal split - ${truncateAtWordBoundary(contradiction, 60)}... `;
    } else if (contradiction.includes('but')) {
      const parts = contradiction.split('BUT');
      acknowledgment += `Last time you were holding that tension between ${parts[0].trim()} and ${parts[1].trim()}. `;
    }
  } else if (keyQuotes.length > 0) {
    // Reference physical or emotional themes
    const quote = keyQuotes[0].replace(/"/g, '');
    acknowledgment += `Last time you mentioned ${truncateAtWordBoundary(quote, 50)}... `;
  }

  // Agent-specific follow-up
  switch (agentName.toLowerCase()) {
    case 'sarah':
      acknowledgment += `How has that been sitting with you emotionally?`;
      break;
    case 'mathew':
      acknowledgment += `What patterns have you noticed since then?`;
      break;
    case 'marcus':
      acknowledgment += `How has that tension been evolving?`;
      break;
    case 'zhanna':
      acknowledgment += `What's your body telling you about that today?`;
      break;
    default:
      acknowledgment += `What's shifted since we last talked?`;
  }

  return acknowledgment;
}

/**
 * Enhanced memory context builder with CSS focus
 */
export async function buildEnhancedMemoryContext(
  userId: string, 
  firstName: string = 'there',
  currentAgentName: string = 'Sarah'
): Promise<{ context: string; verbalAcknowledgment: string }> {
  try {
    console.log(`🧠 Building CSS-focused memory context for user ${userId}`);

    // Get CSS progression context
    const cssContext = await getCSSProgressionContext(userId);

    // Get recent sessions with more detail
    const { data: sessions } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const sessionCount = sessions?.length || 0;

    if (sessionCount === 0) {
      return {
        context: 'First session with this user.',
        verbalAcknowledgment: `Hello ${firstName}, I'm ${currentAgentName}. What brings you here today?`
      };
    }

    // Get the most recent transcript for pattern analysis
    const { data: lastTranscript } = await supabase
      .from('session_transcripts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Create a SessionSummary object for the last session if we have transcript
    let lastSession: SessionSummary | null = null;

    if (sessions && sessions.length > 0 && lastTranscript && lastTranscript.text) {
      const mostRecentSession = sessions[0];
      const patterns = detectCSSPatterns(lastTranscript.text, false);

      // Check if it was meaningful
      const transcriptWithSession = {
        ...mostRecentSession,
        text: lastTranscript.text
      };

      lastSession = {
        id: mostRecentSession.id,
        callId: mostRecentSession.call_id,
        date: mostRecentSession.created_at,
        duration: mostRecentSession.duration_seconds || 0,
        transcript: lastTranscript.text,
        summary: '',
        cssStage: patterns.currentStage,
        patterns: patterns,
        isMeaningful: isMeaningfulSession(transcriptWithSession, patterns)
      };

      console.log(`📝 Last session analysis:
        - Call ID: ${lastSession.callId}
        - Duration: ${lastSession.duration}s
        - Meaningful: ${lastSession.isMeaningful}
        - Patterns found: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}`);
    }

    // Build memory context
    let memoryContext = `SESSION CONTEXT:\n`;
    memoryContext += `Client: ${firstName}\n`;
    memoryContext += `Total Sessions: ${sessionCount}\n\n`;
    memoryContext += cssContext;
    memoryContext += `\n`;

    // Agent-specific guidance based on CSS stage
    const { data: latestSummary } = await supabase
      .from('therapeutic_context')
      .select('content')
      .eq('user_id', userId)
      .eq('context_type', 'css_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Parse metadata from content if it exists
    let progression: any = null;
    if (latestSummary?.content && latestSummary.content.includes('---METADATA---')) {
      const parts = latestSummary.content.split('---METADATA---');
      try {
        progression = JSON.parse(parts[1]);
      } catch (e) {
        console.log('Could not parse embedded metadata');
      }
    }

    if (progression) {

      memoryContext += `\nAGENT GUIDANCE:\n`;
      memoryContext += `- Current CSS Stage: ${progression.currentStage}\n`;
      memoryContext += `- You may reference any of the quoted material naturally\n`;
      memoryContext += `- Focus on ${currentAgentName === 'Sarah' ? 'emotional contradictions (CVDC)' : 
                         currentAgentName === 'Mathew' ? 'behavioral gaps (IBM)' :
                         currentAgentName === 'Marcus' ? 'integration moments (Thend)' :
                         'somatic experiences'}\n`;
      memoryContext += `- Build on established patterns to progress through CSS stages\n`;
      memoryContext += `- Use direct quotes when therapeutically appropriate\n`;
    }

    // Get CSS progressions for more specific acknowledgment
    const { data: cssProgressions } = await supabase
      .from('css_progressions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    
    // NOW WE USE THE SOPHISTICATED GREETING GENERATOR!
    const verbalAcknowledgment = createVerbalAcknowledgment(
      firstName,
      lastSession,
      currentAgentName,
      cssProgressions
    );

    console.log('✅ CSS progression context built with personalized greeting');
    console.log(`📊 CSS Stage: ${latestSummary?.metadata?.currentStage || 'Unknown'}`);
    console.log(`💬 Personalized greeting: ${verbalAcknowledgment}`);

    return {
      context: memoryContext,
      verbalAcknowledgment: verbalAcknowledgment
    };

  } catch (error) {
    console.error('Error building CSS context:', error);
    return {
      context: 'Unable to retrieve session data.',
      verbalAcknowledgment: `Hello ${firstName}, I'm ${currentAgentName}. What brings you here today?`
    };
  }
}

/**
 * Enhanced session context storage with pattern analysis
 */
export async function storeEnhancedSessionContext(
  userId: string,
  callId: string,
  content: string,
  contextType: string = 'session_insight'
): Promise<void> {
  try {
    // If storing a call summary, enhance it with pattern analysis
    if (contextType === 'call_summary') {
      const patterns = detectCSSPatterns(content, false);
      const meaningful = patterns.cvdcPatterns.length > 0 || 
                        patterns.ibmPatterns.length > 0 || 
                        patterns.thendIndicators.length > 0;

      // Store enhanced summary with CSS context
      const { error: insertError } = await supabase
        .from('therapeutic_context')
        .insert({
          user_id: userId,
          call_id: callId,
          context_type: contextType,
          content: content,
          css_stage: patterns.currentStage,
          pattern_type: meaningful ? 'enhanced_summary' : 'basic_summary',
          confidence: meaningful ? 0.9 : 0.6,
          importance: meaningful ? 8 : 5
        });

      if (insertError) {
        console.error('❌ Failed to store enhanced summary:', insertError);
        throw insertError;
      }
    } else {
      // Store regular context
      const { error: insertError } = await supabase
        .from('therapeutic_context')
        .insert({
          user_id: userId,
          call_id: callId,
          context_type: contextType,
          content: content,
          confidence: 0.8,
          importance: 5
        });

      if (insertError) {
        console.error('❌ Failed to store regular context:', insertError);
        throw insertError;
      }
    }

    console.log(`✅ Enhanced therapeutic context stored for ${callId} (${contextType})`);
  } catch (error) {
    console.error('Error storing enhanced context:', error);
  }
}

// Re-export original function for backward compatibility
export async function buildMemoryContext(userId: string): Promise<string> {
  const result = await buildEnhancedMemoryContext(userId);
  return result.context;
}

export async function storeSessionContext(
  userId: string,
  callId: string,
  content: string,
  contextType: string = 'session_insight'
): Promise<void> {
  return storeEnhancedSessionContext(userId, callId, content, contextType);
}