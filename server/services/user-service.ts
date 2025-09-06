import { supabase } from './supabase-service';

export interface UserDeletionResult {
  success: boolean;
  deletedUserId?: string;
  deletedEmail?: string;
  deletedCounts?: {
    sessions: number;
    contexts: number;
    transcripts: number;
  };
  error?: string;
}

export async function getRelatedDataCounts(userId: string) {
  const [sessions, contexts, transcripts] = await Promise.all([
    supabase
      .from('therapeutic_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('therapeutic_context')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('session_transcripts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
  ]);

  return {
    sessions: sessions.count || 0,
    contexts: contexts.count || 0,
    transcripts: transcripts.count || 0
  };
}

export async function deleteUserCascade(userId: string): Promise<UserDeletionResult> {
  try {
    // Get user info before deletion
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    // Get counts before deletion
    const counts = await getRelatedDataCounts(userId);

    // Delete user (CASCADE handles related tables)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      return {
        success: false,
        error: deleteError.message
      };
    }

    console.log(`✅ Cascade delete completed for user ${user.email}`);
    console.log(`📊 Deleted: ${counts.sessions} sessions, ${counts.contexts} contexts, ${counts.transcripts} transcripts`);

    return {
      success: true,
      deletedUserId: userId,
      deletedEmail: user.email,
      deletedCounts: counts
    };
    
  } catch (error) {
    console.error('Error in deleteUserCascade:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function findUserByEmail(email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();
  
  return { user: data, error };
}

export async function verifyUserDeleted(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();
  
  return !data;
}