import { supabase } from './supabase-service';

/**
 * Builds memory context for display to users AND AI agents
 * Now filters insights to only show user-friendly content
 */
export async function buildMemoryContext(userId: string): Promise<string> {
  try {
    // Fetch user's name for proper display
    const { data: userProfile } = await supabase
      .from('users')
      .select('first_name')
      .eq('id', userId)
      .single();

    const userName = userProfile?.first_name || 'there';

    // Fetch recent sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return '';
    }

    // MODIFIED: Fetch ONLY user-friendly insights (exclude technical metadata)
    const { data: insights, error: insightsError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .in('context_type', ['session_insight', 'call_summary', 'conversational_summary'])  // Only user-friendly types
      .order('created_at', { ascending: false })
      .limit(5);

    if (insightsError) {
      console.error('Error fetching insights:', insightsError);
      return '';
    }

    // Get CSS-specific patterns (for agent context, not displayed to user)
    const { data: cssPatterns } = await supabase
      .from('css_patterns')
      .select('css_stage, pattern_type, content, extracted_contradiction')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .limit(3);

    // Format memory context
    let memoryContext = '';

    if (sessions && sessions.length > 0) {
      // Use actual user name instead of "this user"
      memoryContext += `You have had ${sessions.length} previous sessions with ${userName}. `;

      const lastSession = sessions[0];
      const lastDate = new Date(lastSession.created_at).toLocaleDateString();
      memoryContext += `The last session was on ${lastDate}. `;

      if (lastSession.duration_seconds) {
        const minutes = Math.floor(lastSession.duration_seconds / 60);
        memoryContext += `It lasted ${minutes} minutes. `;
      }
    }

    // MODIFIED: Better filtering and formatting of insights
    if (insights && insights.length > 0) {
      memoryContext += '\n\nKey insights from previous sessions:\n';

      // Filter out duplicate or technical-looking content
      const userFriendlyInsights = insights.filter(insight => {
        const content = insight.content.toLowerCase();
        // Exclude entries that look like technical metadata
        return !content.includes('"exchangecount"') && 
               !content.includes('"narrativedepth"') &&
               !content.includes('"therapeuticarc"') &&
               !content.includes('"dominantmovement"') &&
               !content.includes('session with sarah') && // Avoid duplicate summaries
               !content.includes('session with mathew') &&
               content.length > 20; // Exclude very short entries
      });

      // Display only the most relevant insights
      userFriendlyInsights.slice(0, 3).forEach((insight, index) => {
        // Replace generic terms with actual names
        let content = insight.content;
        const sessionForInsight = sessions?.find(s => s.call_id === insight.call_id);
        const agentName = sessionForInsight?.agent_name || 'Sarah';

        content = content
          .replace(/\b(the |this )?user\b/gi, userName)
          .replace(/\b(the )?AI\b/gi, agentName);

        memoryContext += `${index + 1}. ${content}\n`;
      });
    }

    // Add CSS patterns for agent context (but keep it subtle for user display)
    if (cssPatterns && cssPatterns.length > 0) {
      const currentStage = cssPatterns[0].css_stage;
      memoryContext += `\n\nTherapeutic Progress: Currently in ${formatStageName(currentStage)} stage. `;

      const cvdcPattern = cssPatterns.find(p => p.pattern_type === 'CVDC');
      if (cvdcPattern) {
        const contradiction = cvdcPattern.extracted_contradiction || cvdcPattern.content;
        memoryContext += `Key pattern: "${contradiction}" `;
      }
    }

    return memoryContext || 'This is your first session together.';
  } catch (error) {
    console.error('Error building memory context:', error);
    return 'Welcome to your session.';
  }
}

/**
 * Build memory context specifically for user display (simpler, cleaner)
 */
export async function buildUserDisplayContext(userId: string): Promise<string[]> {
  try {
    // Get only the most recent narrative insights (excluding call_summary)
    const { data: insights, error } = await supabase
      .from('therapeutic_context')
      .select('content, created_at')
      .eq('user_id', userId)
      .in('context_type', ['session_insight', 'conversational_summary'])
      .neq('context_type', 'process_assessment')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error || !insights || insights.length === 0) {
      return ['Starting your therapeutic journey'];
    }

    // Filter and format for display
    return insights
      .filter(insight => {
        const content = insight.content.toLowerCase();
        return !content.includes('exchangecount') && 
               !content.includes('narrativedepth') &&
               !content.includes('session with') &&
               content.length > 20;
      })
      .map(insight => insight.content)
      .slice(0, 2); // Show max 2 insights on the UI
  } catch (error) {
    console.error('Error building user display context:', error);
    return ['Welcome to your therapeutic space'];
  }
}

/**
 * Format CSS stage names for user-friendly display
 */
function formatStageName(stage: string): string {
  const stageMap: { [key: string]: string } = {
    'pointed_origin': 'early exploration',
    'focus_bind': 'pattern recognition',
    'thend': 'therapeutic shift',
    'cyvc': 'emerging flexibility',
    'CVDC': 'pattern awareness',
    'IBM': 'behavior mapping',
    'SUSPENSION': 'reflection'
  };

  return stageMap[stage] || stage.toLowerCase().replace('_', ' ');
}

/**
 * Enhanced memory context builder that includes last session summary
 * for natural conversation continuity
 */
export async function buildMemoryContextWithSummary(userId: string): Promise<{
  memoryContext: string;
  lastSessionSummary: string | null;
  shouldReferenceLastSession: boolean;
}> {
  try {
    console.log(`📚 Building enhanced memory context for user: ${userId}`);

    // Fetch the most recent conversational summary
    const { data: lastSummary, error: summaryError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .eq('context_type', 'conversational_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (summaryError && summaryError.code !== 'PGRST116') {
      console.error('Error fetching last summary:', summaryError);
    }

    // Also check for regular call_summary if no conversational_summary exists
    let fallbackSummary = null;
    if (!lastSummary) {
      const { data: callSummary } = await supabase
        .from('therapeutic_context')
        .select('*')
        .eq('user_id', userId)
        .eq('context_type', 'call_summary')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (callSummary) {
        fallbackSummary = callSummary;
        console.log('📝 Using call_summary as fallback for conversation continuity');
      }
    }

    // Get the existing base memory context
    const baseContext = await buildMemoryContext(userId);

    // Use either conversational_summary or call_summary
    const summaryToUse = lastSummary || fallbackSummary;

    // Determine if we should reference the last session
    let shouldReference = false;
    let timeSinceLastSession = null;

    if (summaryToUse) {
      const lastSessionTime = new Date(summaryToUse.created_at).getTime();
      const currentTime = Date.now();
      const daysSinceLastSession = (currentTime - lastSessionTime) / (1000 * 60 * 60 * 24);

      // Reference if within 7 days
      shouldReference = daysSinceLastSession <= 7;

      // Log time since last session for debugging
      if (daysSinceLastSession < 1) {
        timeSinceLastSession = 'earlier today';
      } else if (daysSinceLastSession === 1) {
        timeSinceLastSession = 'yesterday';
      } else if (daysSinceLastSession < 7) {
        timeSinceLastSession = `${Math.floor(daysSinceLastSession)} days ago`;
      } else if (daysSinceLastSession < 30) {
        timeSinceLastSession = `${Math.floor(daysSinceLastSession / 7)} weeks ago`;
      } else {
        timeSinceLastSession = 'over a month ago';
      }

      console.log(`⏰ Last session was ${timeSinceLastSession} - Reference: ${shouldReference}`);
    }

    // Process the summary for better conversational use
    let processedSummary = null;
    if (summaryToUse?.content) {
      processedSummary = enhanceSummaryForConversation(summaryToUse.content);
    }

    // Add timing context to the summary if relevant
    if (processedSummary && timeSinceLastSession && shouldReference) {
      processedSummary = `Last session (${timeSinceLastSession}): ${processedSummary}`;
    }

    console.log(`✅ Enhanced memory context built:`);
    console.log(`   - Has base context: ${baseContext.length > 0}`);
    console.log(`   - Has last summary: ${!!processedSummary}`);
    console.log(`   - Should reference: ${shouldReference}`);

    return {
      memoryContext: baseContext,
      lastSessionSummary: processedSummary,
      shouldReferenceLastSession: shouldReference
    };

  } catch (error) {
    console.error('Error building enhanced memory context:', error);

    // Fallback to basic context if enhanced version fails
    const basicContext = await buildMemoryContext(userId);
    return {
      memoryContext: basicContext,
      lastSessionSummary: null,
      shouldReferenceLastSession: false
    };
  }
}

/**
 * Helper function to enhance summary for more natural conversation
 */
function enhanceSummaryForConversation(summary: string): string {
  // Transform technical/clinical language to conversational
  let enhanced = summary;

  // Replace clinical terms with conversational ones
  const replacements = [
    ['User expressed conflicting feelings:', 'They were working with'],
    ['Noticed gap between intentions and actions around', 'We explored the gap between what they want and what happens with'],
    ['Key emotions:', 'They mentioned feeling'],
    ['Session with', 'In our conversation with'],
    ['detected pattern', 'noticed'],
    ['CSS Stage:', 'Therapeutic progress:'],
    ['CVDC pattern:', 'Contradiction:'],
    ['IBM pattern:', 'Intention-behavior gap:'],
    ['pointed_origin', 'early exploration'],
    ['focus_bind', 'deepening awareness'],
    ['thend', 'therapeutic shift'],
    ['cyvc', 'emerging flexibility']
  ];

  replacements.forEach(([from, to]) => {
    enhanced = enhanced.replace(new RegExp(from, 'gi'), to);
  });

  // Clean up any remaining technical artifacts
  enhanced = enhanced
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();

  return enhanced;
}

export async function storeSessionContext(
  userId: string,
  callId: string,
  content: string,
  contextType: string = 'session_insight',
  agentName?: string
): Promise<void> {
  try {
    // Process content to use actual names if needed
    let processedContent = content;

    // Only fetch names if we're storing a summary that might have generic terms
    if (contextType === 'call_summary' || contextType === 'session_insight' || contextType === 'conversational_summary') {
      const { data: userProfile } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', userId)
        .single();

      const userName = userProfile?.first_name || 'the user';

      // Get agent name if not provided
      if (!agentName) {
        const { data: session } = await supabase
          .from('therapeutic_sessions')
          .select('agent_name')
          .eq('call_id', callId)
          .single();
        agentName = session?.agent_name || 'Sarah';
      }

      // Replace generic terms
      processedContent = processedContent
        .replace(/\b(the |this )?user\b/gi, userName)
        .replace(/\b(the )?AI\b/gi, agentName || 'Sarah');
    }

    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        call_id: callId,
        context_type: contextType,
        content: processedContent,
        confidence: 0.8,
        importance: 5
      });

    console.log(`✅ Stored therapeutic context (${contextType})`);
  } catch (error) {
    console.error('Error storing context:', error);
  }
}

/**
 * Store both regular and conversational summaries
 * Used after enhanced summary generation from Phase 1
 */
export async function storeEnhancedSessionContext(
  userId: string,
  callId: string,
  regularSummary: string,
  conversationalSummary: string
): Promise<void> {
  try {
    // Get names for proper storage
    const { data: userProfile } = await supabase
      .from('users')
      .select('first_name')
      .eq('id', userId)
      .single();

    const userName = userProfile?.first_name || 'the user';

    const { data: session } = await supabase
      .from('therapeutic_sessions')
      .select('agent_name')
      .eq('call_id', callId)
      .single();

    const agentName = session?.agent_name || 'Sarah';

    // Process both summaries to use actual names
    const processedRegularSummary = regularSummary
      .replace(/\b(the |this )?user\b/gi, userName)
      .replace(/\b(the )?AI\b/gi, agentName);

    const processedConversationalSummary = conversationalSummary
      .replace(/\b(the |this )?user\b/gi, userName)
      .replace(/\b(the )?AI\b/gi, agentName);

    const contexts = [
      {
        user_id: userId,
        call_id: callId,
        context_type: 'call_summary',
        content: processedRegularSummary,
        confidence: 0.8,
        importance: 5
      },
      {
        user_id: userId,
        call_id: callId,
        context_type: 'conversational_summary',
        content: processedConversationalSummary,
        confidence: 0.85,
        importance: 8
      }
    ];

    const { error } = await supabase
      .from('therapeutic_context')
      .insert(contexts);

    if (error) throw error;

    console.log('✅ Stored enhanced therapeutic context (both summaries)');
  } catch (error) {
    console.error('Error storing enhanced context:', error);
  }
}