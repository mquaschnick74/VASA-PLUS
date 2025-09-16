import { supabase } from './supabase-service';

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
    const emotionalWords = ['angry', 'sad', 'tired', 'guilty', 'anxious', 'overwhelmed'];
    const foundEmotions = emotionalWords.filter(word => 
      transcript.toLowerCase().includes(word)
    );

    if (foundEmotions.length > 0) {
      summary += `Key emotions: ${foundEmotions.join(', ')}. `;
    }
  }

  // Add session metadata
  summary += `Session with ${agentName} lasted ${Math.floor(duration / 60)} minutes. `;

  // Store as both call_summary AND conversational_summary
  await supabase
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

  return summary;
}

function formatForConversation(summary: string): string {
  // Transform the summary into agent-ready conversation starter hints
  const conversationalFormat = summary
    .replace('User expressed conflicting feelings:', 'They were working with')
    .replace('Noticed gap between intentions and actions around', 'We explored the gap between what they want and what happens with')
    .replace('Key emotions:', 'They mentioned feeling')
    .replace('Session with', 'In our last conversation with');

  return conversationalFormat;
}