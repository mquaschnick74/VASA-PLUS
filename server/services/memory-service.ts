// Enhanced Memory Service - Rich therapeutic context with specific quotes and natural acknowledgments
import { supabase } from './supabase-service';
import { detectCSSPatterns, CSSPatterns } from './css-pattern-service';

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
 */
function isMeaningfulSession(session: any, patterns: CSSPatterns): boolean {
  // Duration check - at least 2 minutes
  if (session.duration_seconds && session.duration_seconds < 120) {
    return false;
  }

  // CSS patterns detected
  const totalPatterns = patterns.cvdcPatterns.length + 
                       patterns.ibmPatterns.length + 
                       patterns.thendIndicators.length + 
                       patterns.cyvcPatterns.length;

  if (totalPatterns > 0) {
    return true;
  }

  // Transcript length check (meaningful conversation)
  if (session.text && session.text.length > 500) {
    return true;
  }

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
 * Creates natural verbal acknowledgment for returning sessions
 */
function createVerbalAcknowledgment(
  firstName: string, 
  lastSession: SessionSummary | null,
  agentName: string
): string {
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
      acknowledgment += `Last time you were exploring that internal split - ${contradiction.substring(0, 60)}... `;
    } else if (contradiction.includes('but')) {
      const parts = contradiction.split('BUT');
      acknowledgment += `Last time you were holding that tension between ${parts[0].trim()} and ${parts[1].trim()}. `;
    }
  } else if (keyQuotes.length > 0) {
    // Reference physical or emotional themes
    const quote = keyQuotes[0].replace(/"/g, '');
    acknowledgment += `Last time you mentioned ${quote.substring(0, 50)}... `;
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
 * Enhanced memory context builder with rich therapeutic details
 */
export async function buildEnhancedMemoryContext(
  userId: string, 
  firstName: string = 'there',
  currentAgentName: string = 'Sarah'
): Promise<{ context: string; verbalAcknowledgment: string }> {
  try {
    console.log(`🧠 Building enhanced memory context for user ${userId}`);

    // First try to get sessions from therapeutic_sessions table
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
    }

    // If no sessions found in therapeutic_sessions, check session_transcripts directly
    let sessionCallIds: string[] = [];
    let sessionData: any[] = [];
    
    if (!sessions || sessions.length === 0) {
      // Fallback to session_transcripts to find sessions
      const { data: transcripts } = await supabase
        .from('session_transcripts')
        .select('call_id, timestamp')
        .eq('user_id', userId)
        .eq('role', 'complete')
        .order('timestamp', { ascending: false })
        .limit(5);
      
      if (transcripts && transcripts.length > 0) {
        // Create synthetic session data from transcripts
        sessionData = transcripts.map(t => ({
          id: t.call_id,
          call_id: t.call_id,
          user_id: userId,
          created_at: t.timestamp,
          duration_seconds: 0, // Unknown from transcript alone
          agent_name: 'Unknown'
        }));
        console.log(`📚 Found ${transcripts.length} sessions from transcripts for ${firstName}`);
      } else {
        return {
          context: 'First session with this user.',
          verbalAcknowledgment: `Hello ${firstName}, welcome to your first session. What brings you here today?`
        };
      }
    } else {
      sessionData = sessions;
    }

    // Process sessions and determine meaningfulness
    const processedSessions: SessionSummary[] = [];

    for (const session of sessionData) {
      // Fetch transcript for this session - handle multiple records
      console.log(`📖 Fetching transcript for call_id: ${session.call_id}`);
      const { data: transcriptData, error: transcriptError } = await supabase
        .from('session_transcripts')
        .select('text')
        .eq('call_id', session.call_id)
        .eq('role', 'complete')
        .limit(1);  // Get first one if multiple exist
      
      if (transcriptError) {
        console.log(`⚠️ Error fetching transcript for ${session.call_id}:`, transcriptError.message);
      }
      
      // Handle array or single result
      let transcript = '';
      if (transcriptData && transcriptData.length > 0) {
        transcript = transcriptData[0].text || '';
        console.log(`✅ Found transcript with ${transcript.length} characters`);
        // Log a preview of the transcript for debugging
        if (transcript.length > 0) {
          const preview = transcript.substring(0, 100).replace(/\n/g, ' ');
          console.log(`📝 Transcript preview: ${preview}...`);
        }
      } else {
        console.log(`❌ No transcript found for call_id: ${session.call_id}`);
      }
      
      const patterns = detectCSSPatterns(transcript, false);
      const meaningful = isMeaningfulSession(session, patterns);

      const summary = meaningful ? 
        generateEnhancedSummary(session, patterns, firstName, transcript) :
        'Brief session - limited therapeutic content';

      processedSessions.push({
        id: session.id,
        callId: session.call_id,
        date: new Date(session.created_at).toLocaleDateString(),
        duration: session.duration_seconds || 0,
        transcript: transcript,
        summary: summary,
        cssStage: patterns.currentStage,
        patterns: patterns,
        isMeaningful: meaningful
      });
    }

    // Find most recent meaningful session
    const lastMeaningfulSession = processedSessions.find(s => s.isMeaningful) || null;

    // Get recent insights
    const { data: insights } = await supabase
      .from('therapeutic_context')
      .select('content, context_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);

    // Build context
    let memoryContext = '';

    // Session count and basic info
    const meaningfulCount = processedSessions.filter(s => s.isMeaningful).length;
    memoryContext += `PREVIOUS SESSIONS: ${sessionData.length} total (${meaningfulCount} therapeutically meaningful)\n`;

    // Most recent meaningful session details
    if (lastMeaningfulSession) {
      memoryContext += `\nLAST MEANINGFUL SESSION (${lastMeaningfulSession.date}):\n`;
      memoryContext += `${lastMeaningfulSession.summary}\n`;
      memoryContext += `CSS Stage: ${lastMeaningfulSession.cssStage}\n`;

      // Pattern summary
      const patternCounts = [];
      if (lastMeaningfulSession.patterns.cvdcPatterns.length > 0) {
        patternCounts.push(`CVDC: ${lastMeaningfulSession.patterns.cvdcPatterns.length}`);
      }
      if (lastMeaningfulSession.patterns.ibmPatterns.length > 0) {
        patternCounts.push(`IBM: ${lastMeaningfulSession.patterns.ibmPatterns.length}`);
      }
      if (lastMeaningfulSession.patterns.thendIndicators.length > 0) {
        patternCounts.push(`Thend: ${lastMeaningfulSession.patterns.thendIndicators.length}`);
      }

      if (patternCounts.length > 0) {
        memoryContext += `Patterns: ${patternCounts.join(', ')}\n`;
      }
    }

    // Additional insights
    if (insights && insights.length > 0) {
      memoryContext += `\nKEY INSIGHTS:\n`;
      insights.forEach((insight, index) => {
        memoryContext += `${index + 1}. ${insight.content}\n`;
      });
    }

    // Create verbal acknowledgment
    const verbalAcknowledgment = createVerbalAcknowledgment(firstName, lastMeaningfulSession, currentAgentName);

    memoryContext += `\nCONTEXT GUIDELINES:\n`;
    memoryContext += `- Reference specific quotes and contradictions naturally when relevant\n`;
    memoryContext += `- Don't hallucinate details not mentioned above\n`;
    memoryContext += `- Build on established therapeutic themes\n`;
    memoryContext += `- Acknowledge progress and patterns when appropriate\n`;

    console.log('✅ Enhanced memory context built successfully');
    console.log(`📝 Context: ${memoryContext.substring(0, 100)}...`);
    console.log(`💬 Greeting: ${verbalAcknowledgment}`);
    
    return {
      context: memoryContext,
      verbalAcknowledgment: verbalAcknowledgment
    };

  } catch (error) {
    console.error('Error building enhanced memory context:', error);
    return {
      context: 'Unable to retrieve previous session data.',
      verbalAcknowledgment: `Hello ${firstName}, welcome to your session.`
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