import { supabase } from './supabase-service';  // THIS WAS MISSING!

interface SessionSummaryData {
  userId: string;
  callId: string;
  transcript?: string;
  cssPatterns?: any;
  agentName: string;
  duration: number;
}

export async function generateEnhancedSessionSummary(data: SessionSummaryData): Promise<string> {
  const { userId, callId, transcript, cssPatterns, agentName, duration } = data;

  console.log(`🎯 Generating enhanced summary for call ${callId}`);

  // Create a conversational summary that can be referenced naturally
  let summary = '';

  // Add emotional tone
  if (cssPatterns?.cvdcPatterns?.length > 0) {
    summary += `User expressed conflicting feelings: ${cssPatterns.cvdcPatterns[0]}. `;
  }

  if (cssPatterns?.ibmPatterns?.length > 0) {
    summary += `Noticed gap between intentions and actions around ${cssPatterns.ibmPatterns[0]}. `;
  }

  // Add key themes (extract from transcript if available)
  if (transcript) {
    // Extract emotional keywords (simplified example)
    const emotionalWords = ['angry', 'sad', 'tired', 'guilty', 'anxious', 'overwhelmed', 'hurt', 'panic', 'defensive'];
    const foundEmotions = emotionalWords.filter(word => 
      transcript.toLowerCase().includes(word)
    );

    if (foundEmotions.length > 0) {
      summary += `Key emotions: ${foundEmotions.join(', ')}. `;
    }

    // Extract key topics from transcript
    const topics = [];
    if (transcript.includes('Alex')) topics.push('relationship with Alex');
    if (transcript.includes('work')) topics.push('work stress');
    if (transcript.includes('argument') || transcript.includes('fight')) topics.push('conflict patterns');
    if (transcript.includes('dishes')) topics.push('household tensions');

    if (topics.length > 0) {
      summary += `Discussed: ${topics.join(', ')}. `;
    }
  }

  // Add session metadata
  summary += `Session with ${agentName} lasted ${Math.floor(duration / 60)} minutes. `;

  try {
    // Store as both call_summary AND conversational_summary
    const { error } = await supabase
      .from('therapeutic_context')
      .insert([
        {
          user_id: userId,
          call_id: callId,
          context_type: 'call_summary',
          content: summary,
          confidence: 0.8,
          importance: 5
        },
        {
          user_id: userId,
          call_id: callId,
          context_type: 'conversational_summary',
          content: formatForConversation(summary),
          confidence: 0.85,
          importance: 8
        }
      ]);

    if (error) {
      console.error('❌ Failed to store enhanced summaries:', error);
      throw error;
    }

    console.log('✅ Stored both call_summary and conversational_summary');
  } catch (err) {
    console.error('❌ Error in generateEnhancedSessionSummary:', err);
    throw err;
  }

  return summary;
}

function formatForConversation(summary: string): string {
  // Transform the summary into agent-ready conversation starter hints
  const conversationalFormat = summary
    .replace('User expressed conflicting feelings:', 'They were working with')
    .replace('Noticed gap between intentions and actions around', 'We explored the gap between what they want and what happens with')
    .replace('Key emotions:', 'They mentioned feeling')
    .replace('Discussed:', 'We talked about')
    .replace('Session with', 'In our last conversation with');

  return conversationalFormat;
}