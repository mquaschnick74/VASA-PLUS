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
 * Enhanced memory context builder with rich therapeutic details
 */
export async function buildEnhancedMemoryContext(
  userId: string, 
  firstName: string = 'there',
  currentAgentName: string = 'Sarah'
): Promise<{ context: string; verbalAcknowledgment: string }> {
  try {
    console.log(`🧠 Building enhanced memory context for user ${userId} with agent ${currentAgentName}`);

    // Fetch recent sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return {
        context: 'Unable to retrieve previous session data.',
        verbalAcknowledgment: `Hello ${firstName}, welcome to your session.`
      };
    }

    if (!sessions || sessions.length === 0) {
      return {
        context: 'First session with this user.',
        verbalAcknowledgment: `Hello ${firstName}, welcome to your first session. What brings you here today?`
      };
    }

    // Process sessions and determine meaningfulness WITH ENHANCED DETECTION
    const processedSessions: SessionSummary[] = [];

    for (const session of sessions) {
      // Fetch transcript for this session
      const { data: transcriptData } = await supabase
        .from('session_transcripts')
        .select('text')
        .eq('call_id', session.call_id)
        .eq('role', 'complete')
        .single();
      
      // Check for therapeutic insights
      const { data: insightData } = await supabase
        .from('therapeutic_context')
        .select('content')
        .eq('call_id', session.call_id)
        .limit(1);
      
      const transcript = transcriptData?.text || '';
      const hasTherapeuticInsights = insightData && insightData.length > 0;
      
      // Add insights flag to session for meaningful detection
      const sessionWithInsights = {
        ...session,
        text: transcript,
        hasTherapeuticInsights
      };
      
      const patterns = detectCSSPatterns(transcript, false);
      const meaningful = isMeaningfulSession(sessionWithInsights, patterns);

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

    console.log(`📊 Session analysis:
      - Total sessions: ${sessions.length}
      - Meaningful sessions: ${processedSessions.filter(s => s.isMeaningful).length}
      - Last meaningful: ${lastMeaningfulSession ? lastMeaningfulSession.date : 'None'}`);

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
    memoryContext += `PREVIOUS SESSIONS: ${sessions.length} total (${meaningfulCount} therapeutically meaningful)\n`;

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
    console.log(`💬 ${currentAgentName} greeting: ${verbalAcknowledgment}`);
    
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