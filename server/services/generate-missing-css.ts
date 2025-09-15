import { supabase } from './supabase-service';
import { generateCSSProgressionSummary } from './summary-service';

/**
 * Generate CSS summaries for sessions that have transcripts but no CSS summary
 */
export async function generateMissingCSSSummaries() {
  try {
    console.log('🔍 Looking for sessions with missing CSS summaries...');
    
    // Get all users
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, email');
    
    if (!users || users.length === 0) {
      console.log('No users found');
      return { success: false, message: 'No users found' };
    }
    
    const results = [];
    
    for (const user of users) {
      // Check if user has CSS summaries
      const { data: cssData } = await supabase
        .from('therapeutic_context')
        .select('call_id')
        .eq('user_id', user.id)
        .eq('context_type', 'css_summary');
      
      const existingCSScallIds = new Set(cssData?.map(d => d.call_id) || []);
      
      // Get all transcripts for this user
      const { data: transcripts } = await supabase
        .from('session_transcripts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (!transcripts || transcripts.length === 0) {
        continue;
      }
      
      // Process transcripts that don't have CSS summaries
      for (const transcript of transcripts) {
        if (!transcript.text || transcript.text.length < 100) {
          continue; // Skip very short transcripts
        }
        
        if (existingCSScallIds.has(transcript.call_id)) {
          continue; // Already has CSS summary
        }
        
        console.log(`📝 Generating CSS summary for ${user.first_name} - Call: ${transcript.call_id}`);
        
        try {
          // Get session info
          const { data: session } = await supabase
            .from('therapeutic_sessions')
            .select('*')
            .eq('call_id', transcript.call_id)
            .single();
          
          const agentName = session?.agent_name || 'Sarah';
          
          // Generate CSS summary
          await generateCSSProgressionSummary(
            transcript.text,
            user.id,
            transcript.call_id,
            agentName
          );
          
          results.push({
            user: user.first_name,
            callId: transcript.call_id,
            status: 'generated'
          });
          
          console.log(`✅ CSS summary generated for ${user.first_name}`);
        } catch (error) {
          console.error(`❌ Failed to generate CSS for ${transcript.call_id}:`, error);
          results.push({
            user: user.first_name,
            callId: transcript.call_id,
            status: 'failed',
            error: String(error)
          });
        }
      }
    }
    
    return {
      success: true,
      message: `Processed ${results.length} transcripts`,
      results
    };
  } catch (error) {
    console.error('Error generating missing CSS summaries:', error);
    return {
      success: false,
      error: String(error)
    };
  }
}