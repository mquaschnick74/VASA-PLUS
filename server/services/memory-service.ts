import { supabase } from './supabase-service';

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
      .from('therapeutic_context')
      .select('css_stage, pattern_type, content')
      .eq('user_id', userId)
      .not('pattern_type', 'is', null)
      .order('created_at', { ascending: false })
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
        memoryContext += `Key contradiction: "${cvdcPattern.content}" `;
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
