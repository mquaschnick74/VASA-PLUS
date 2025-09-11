import { supabase } from './supabase-service';
import { determineNarrativePhase } from '../../shared/narrative';

/**
 * Build narrative-aware memory context
 */
export async function buildEnhancedMemoryContext(userId: string): Promise<string> {
  try {
    // Get narrative markers
    const { data: narrativeMarkers } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .in('context_type', ['narrative_marker', 'narrative_theme', 'agent_suggestion'])
      .order('importance', { ascending: false })
      .limit(5);

    // Get sessions for narrative phase determination
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return '';
    }

    // Determine narrative phase
    const sessionCount = sessions?.length || 0;
    const allPatterns = sessions?.flatMap(s => {
      const metadata = s.metadata as any;
      return metadata?.patterns || [];
    }) || [];
    const narrativePhase = determineNarrativePhase(sessionCount, allPatterns);

    // Build narrative-aware context
    let context = '';
    
    // Frame as continuing story
    if (sessionCount > 0) {
      const lastSession = sessions![0];
      const lastDate = new Date(lastSession.created_at).toLocaleDateString();
      
      context += `Continuing the therapeutic narrative. `;
      context += `Session ${sessionCount + 1} of their journey. `;
      context += `Last explored on ${lastDate}. `;
      
      if (lastSession.duration_seconds) {
        const minutes = Math.floor(lastSession.duration_seconds / 60);
        context += `That conversation lasted ${minutes} minutes. `;
      }
    } else {
      context += `Beginning a new therapeutic narrative. `;
    }

    // Add narrative phase context
    if (narrativePhase === 'building') {
      context += '\n\nNarrative journey phase: Building rapport and exploring initial stories.';
    } else if (narrativePhase === 'deepening') {
      context += '\n\nNarrative journey phase: Deepening exploration of established patterns.';
    } else if (narrativePhase === 'integrating') {
      context += '\n\nNarrative journey phase: Supporting narrative integration and synthesis.';
    }

    // Add narrative themes if present
    if (narrativeMarkers && narrativeMarkers.length > 0) {
      context += '\n\nKey narrative themes from previous work:';
      narrativeMarkers.forEach(marker => {
        if (marker.pattern_type === 'NARRATIVE_FRAGMENTATION') {
          context += ` Story showing fragmentation (score: ${marker.confidence || 0}/10).`;
        } else if (marker.context_type === 'agent_suggestion') {
          context += ` ${marker.content}.`;
        } else {
          context += ` ${marker.content}.`;
        }
      });
    }

    // Add CSS pattern evolution in narrative terms
    const { data: cssPatterns } = await supabase
      .from('css_patterns')
      .select('pattern_type, content, extracted_contradiction, narrative_fragmentation')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .limit(5);

    if (cssPatterns && cssPatterns.length > 0) {
      const patternTypes = Array.from(new Set(cssPatterns.map(p => p.pattern_type)));
      context += '\n\nStories being explored: ';
      
      patternTypes.forEach(type => {
        if (type === 'CVDC') context += 'contradictory narratives, ';
        if (type === 'IBM') context += 'story-behavior gaps, ';
        if (type === 'Thend') context += 'emerging integration, ';
        if (type === 'CYVC') context += 'flexible conclusion, ';
      });
      
      // Note high fragmentation if present
      const highFragmentation = cssPatterns.find(p => p.narrative_fragmentation && p.narrative_fragmentation > 7);
      if (highFragmentation) {
        context += '\nNote: Recent narrative showing significant fragmentation.';
      }
    }

    return context || 'Beginning the therapeutic narrative journey.';
  } catch (error) {
    console.error('Error building narrative context:', error);
    return 'Welcome to this conversation.';
  }
}

// Keep original function for backward compatibility
export async function buildMemoryContext(userId: string): Promise<string> {
  try {
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

    // Fetch recent insights
    const { data: insights, error: insightsError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (insightsError) {
      console.error('Error fetching insights:', insightsError);
      return '';
    }

    // Get CSS-specific patterns
    const { data: cssPatterns } = await supabase
      .from('css_patterns')
      .select('css_stage, pattern_type, content, extracted_contradiction')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .limit(3);

    // Format memory context
    let memoryContext = '';
    
    if (sessions && sessions.length > 0) {
      memoryContext += `You have had ${sessions.length} previous sessions with this user. `;
      
      const lastSession = sessions[0];
      const lastDate = new Date(lastSession.created_at).toLocaleDateString();
      memoryContext += `The last session was on ${lastDate}. `;
      
      if (lastSession.duration_seconds) {
        const minutes = Math.floor(lastSession.duration_seconds / 60);
        memoryContext += `It lasted ${minutes} minutes. `;
      }
    }

    if (insights && insights.length > 0) {
      memoryContext += '\n\nKey insights from previous sessions:\n';
      insights.forEach((insight, index) => {
        memoryContext += `${index + 1}. ${insight.content}\n`;
      });
    }

    if (cssPatterns && cssPatterns.length > 0) {
      const currentStage = cssPatterns[0].css_stage;
      memoryContext += `\n\nTherapeutic Progress: Currently in ${currentStage} stage. `;
      
      const cvdcPattern = cssPatterns.find(p => p.pattern_type === 'CVDC');
      if (cvdcPattern) {
        const contradiction = cvdcPattern.extracted_contradiction || cvdcPattern.content;
        memoryContext += `Key contradiction: "${contradiction}" `;
      }
    }

    return memoryContext || 'This is your first session together.';
  } catch (error) {
    console.error('Error building memory context:', error);
    return 'Welcome to your session.';
  }
}

export async function storeSessionContext(
  userId: string,
  callId: string,
  content: string,
  contextType: string = 'session_insight'
): Promise<void> {
  try {
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        call_id: callId,
        context_type: contextType,
        content: content,
        confidence: 0.8,
        importance: 5
      });
    
    console.log('✅ Stored therapeutic context');
  } catch (error) {
    console.error('Error storing context:', error);
  }
}
