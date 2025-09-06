import { db } from './supabase-service';
import { therapeuticSessions, therapeuticContext } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

export async function buildMemoryContext(userId: string): Promise<string> {
  try {
    // Fetch recent sessions
    const sessions = await db
      .select()
      .from(therapeuticSessions)
      .where(eq(therapeuticSessions.user_id, userId))
      .orderBy(desc(therapeuticSessions.created_at))
      .limit(5);

    // Fetch recent insights
    const insights = await db
      .select()
      .from(therapeuticContext)
      .where(eq(therapeuticContext.user_id, userId))
      .orderBy(desc(therapeuticContext.created_at))
      .limit(5);

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
    await db
      .insert(therapeuticContext)
      .values({
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
