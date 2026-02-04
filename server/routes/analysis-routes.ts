// server/routes/analysis-routes.ts
// Unified analysis routes for all analysis types
// Supports: session_summary, intent_analysis, concept_insights, pca_master
// Supports therapist analyzing client sessions via targetUserId

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import { therapistDataService } from '../services/therapist-data-service';

const router = Router();

// Valid analysis types
const VALID_ANALYSIS_TYPES = ['session_summary', 'intent_analysis', 'concept_insights', 'pca_master'] as const;
type AnalysisType = typeof VALID_ANALYSIS_TYPES[number];

// Lazy load service to avoid startup issues
let _analysisService: any = null;
async function getAnalysisService() {
  if (!_analysisService) {
    const { UserAnalysisService } = await import('../services/user-analysis-service');
    _analysisService = new UserAnalysisService();
  }
  return _analysisService;
}

/**
 * Helper to get user profile from auth email
 * Returns id, user_type, and email
 */
async function getUserProfile(authUserEmail: string): Promise<{ id: string; user_type: string; email: string } | null> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, user_type, email')
    .eq('email', authUserEmail)
    .maybeSingle();

  return profile || null;
}

/**
 * Helper to verify therapist has access to client data
 * Checks therapist-client relationship and logs access
 */
async function verifyTherapistAccess(
  therapistId: string,
  clientId: string,
  accessType: string,
  req: AuthRequest
): Promise<{ allowed: boolean; error?: string }> {
  // Check therapist-client relationship
  const { data: relationship } = await supabase
    .from('therapist_client_relationships')
    .select('id, status')
    .eq('therapist_id', therapistId)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();

  let hasPermission = !!relationship;

  // Fallback: check invited_by
  if (!hasPermission) {
    const { data: clientProfile } = await supabase
      .from('user_profiles')
      .select('invited_by')
      .eq('id', clientId)
      .maybeSingle();

    hasPermission = clientProfile?.invited_by === therapistId;
  }

  if (!hasPermission) {
    return {
      allowed: false,
      error: 'You do not have permission to access this client\'s data'
    };
  }

  // Log therapist access
  await therapistDataService.logAccess(
    therapistId,
    clientId,
    accessType,
    undefined,
    req.ip || req.socket.remoteAddress,
    req.headers['user-agent']
  );

  return { allowed: true };
}

/**
 * Helper to resolve the target user for analysis
 * Handles permission checking for therapist viewing client data
 */
async function resolveTargetUser(
  authProfile: { id: string; user_type: string; email: string },
  targetUserId: string | undefined,
  accessType: string,
  req: AuthRequest
): Promise<{ userId: string; error?: string }> {
  // If no targetUserId or it matches auth user, use auth user's ID
  if (!targetUserId || targetUserId === authProfile.id) {
    return { userId: authProfile.id };
  }

  // Different user requested - must be a therapist
  if (authProfile.user_type !== 'therapist') {
    return {
      userId: authProfile.id,
      error: 'Only therapists can analyze other users\' data'
    };
  }

  // Verify therapist has access to this client
  const access = await verifyTherapistAccess(authProfile.id, targetUserId, accessType, req);
  if (!access.allowed) {
    return {
      userId: authProfile.id,
      error: access.error
    };
  }

  return { userId: targetUserId };
}

/**
 * GET /api/analysis/sessions
 * Get list of sessions available for analysis
 * Query params:
 *   - targetUserId?: string - For therapists analyzing client sessions
 */
router.get('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserEmail = req.user?.email;
    if (!authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const authProfile = await getUserProfile(authUserEmail);
    if (!authProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    // Resolve target user (handles therapist viewing client)
    const targetUserId = req.query.targetUserId as string | undefined;
    const { userId, error } = await resolveTargetUser(authProfile, targetUserId, 'analysis_sessions', req);

    if (error) {
      return res.status(403).json({ error: 'Access denied', message: error });
    }

    const service = await getAnalysisService();
    const sessions = await service.getAvailableSessions(userId);

    res.json({
      success: true,
      data: sessions
    });

  } catch (error: any) {
    console.error('❌ Error fetching sessions:', error);
    res.status(500).json({
      error: 'Failed to fetch sessions',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * POST /api/analysis/run
 * Run a specific analysis type
 *
 * Body:
 *   - analysisType: 'session_summary' | 'intent_analysis' | 'concept_insights' | 'pca_master'
 *   - sessionIds?: string[] - Specific call_ids (for intent/concept)
 *   - sessionCount?: number - 1-5 for summary/pca_master (pulls most recent)
 *   - targetUserId?: string - For therapists analyzing client sessions
 */
router.post('/run', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserEmail = req.user?.email;
    if (!authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const authProfile = await getUserProfile(authUserEmail);
    if (!authProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    const { analysisType, sessionIds, sessionCount, targetUserId } = req.body;

    // Validate analysisType
    if (!analysisType || !VALID_ANALYSIS_TYPES.includes(analysisType)) {
      return res.status(400).json({
        error: 'Invalid analysis type',
        message: `analysisType must be one of: ${VALID_ANALYSIS_TYPES.join(', ')}`
      });
    }

    // Resolve target user (handles therapist viewing client)
    const { userId, error } = await resolveTargetUser(authProfile, targetUserId, 'analysis_run', req);

    if (error) {
      return res.status(403).json({ error: 'Access denied', message: error });
    }

    // Validate session selection based on type
    if (analysisType === 'intent_analysis' || analysisType === 'concept_insights') {
      // Single session types require exactly one sessionId
      if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length !== 1) {
        return res.status(400).json({
          error: 'Invalid session selection',
          message: `${analysisType} requires exactly one session. Provide sessionIds array with one call_id.`
        });
      }
    } else {
      // Multi-session types (session_summary, pca_master) use sessionCount
      const count = parseInt(sessionCount) || 3;
      if (count < 1 || count > 5) {
        return res.status(400).json({
          error: 'Invalid session count',
          message: 'sessionCount must be between 1 and 5'
        });
      }
    }

    console.log(`📊 Analysis requested: ${analysisType} for user ${userId}${targetUserId ? ` (by therapist ${authProfile.id})` : ''}`);

    const service = await getAnalysisService();
    const result = await service.runAnalysis(
      userId,
      analysisType as AnalysisType,
      sessionIds,
      sessionCount
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Analysis error:', error);

    // Handle specific error cases
    if (error.message.includes('No transcripts')) {
      return res.status(404).json({
        error: 'No session transcripts found for analysis',
        message: 'Please complete at least one therapeutic session before requesting analysis.'
      });
    }

    if (error.message.includes('OPENAI_API_KEY')) {
      return res.status(500).json({
        error: 'Service configuration error',
        message: 'Analysis service is not properly configured. Please contact support.'
      });
    }

    res.status(500).json({
      error: 'Analysis failed',
      message: error.message || 'An unexpected error occurred during analysis'
    });
  }
});

/**
 * GET /api/analysis/history
 * Get analysis history for the authenticated user
 * Query params:
 *   - type?: 'session_summary' | 'intent_analysis' | 'concept_insights' | 'pca_master'
 *   - limit?: number (default 20)
 *   - targetUserId?: string - For therapists viewing client history
 */
router.get('/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserEmail = req.user?.email;
    if (!authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const authProfile = await getUserProfile(authUserEmail);
    if (!authProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    // Resolve target user (handles therapist viewing client)
    const targetUserId = req.query.targetUserId as string | undefined;
    const { userId, error } = await resolveTargetUser(authProfile, targetUserId, 'analysis_history', req);

    if (error) {
      return res.status(403).json({ error: 'Access denied', message: error });
    }

    const analysisType = req.query.type as AnalysisType | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    // Validate type if provided
    if (analysisType && !VALID_ANALYSIS_TYPES.includes(analysisType)) {
      return res.status(400).json({
        error: 'Invalid analysis type',
        message: `type must be one of: ${VALID_ANALYSIS_TYPES.join(', ')}`
      });
    }

    const service = await getAnalysisService();
    const history = await service.getAnalysisHistory(userId, analysisType, limit);

    res.json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error: any) {
    console.error('❌ Error fetching analysis history:', error);
    res.status(500).json({
      error: 'Failed to fetch analysis history',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/analysis/:id
 * Get a specific analysis by ID
 * Query params:
 *   - targetUserId?: string - For therapists viewing client analysis
 */
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserEmail = req.user?.email;
    if (!authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const authProfile = await getUserProfile(authUserEmail);
    if (!authProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    // Resolve target user (handles therapist viewing client)
    const targetUserId = req.query.targetUserId as string | undefined;
    const { userId, error } = await resolveTargetUser(authProfile, targetUserId, 'analysis_view', req);

    if (error) {
      return res.status(403).json({ error: 'Access denied', message: error });
    }

    const service = await getAnalysisService();
    const analysis = await service.getAnalysisById(userId, id);

    if (!analysis) {
      return res.status(404).json({
        error: 'Analysis not found',
        message: 'The requested analysis could not be found or does not belong to this user.'
      });
    }

    res.json({
      success: true,
      data: analysis
    });

  } catch (error: any) {
    console.error('❌ Error fetching analysis:', error);
    res.status(500).json({
      error: 'Failed to fetch analysis',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * DELETE /api/analysis/:id
 * Delete a specific analysis by ID
 * NOTE: Therapists cannot delete client analyses - only users can delete their own
 */
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserEmail = req.user?.email;
    if (!authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const authProfile = await getUserProfile(authUserEmail);
    if (!authProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    // DELETE intentionally does NOT support targetUserId
    // Users can only delete their own analyses
    const service = await getAnalysisService();
    const deleted = await service.deleteAnalysis(authProfile.id, id);

    if (!deleted) {
      return res.status(404).json({
        error: 'Analysis not found or could not be deleted',
        message: 'The requested analysis could not be found or does not belong to this user.'
      });
    }

    res.json({
      success: true,
      message: 'Analysis deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting analysis:', error);
    res.status(500).json({
      error: 'Failed to delete analysis',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// ============================================================================
// LEGACY PCA ROUTES (kept for backward compatibility)
// These routes maintain the existing /api/analysis/pca-master endpoints
// ============================================================================

// Lazy load PCA service (separate from new analysis service)
let _pcaServiceInstance: any = null;
async function getPCAService() {
  if (!_pcaServiceInstance) {
    const { PCAMasterAnalystService } = await import('../services/pca-master-analyst-service');
    _pcaServiceInstance = new PCAMasterAnalystService();
  }
  return _pcaServiceInstance;
}

/**
 * POST /api/analysis/pca-master
 * Trigger PCA master analysis for authenticated user (LEGACY)
 */
router.post('/pca-master', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user?.id;
    const authUserEmail = req.user?.email;

    if (!authUserId || !authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`🔍 Auth info: id=${authUserId}, email=${authUserEmail}`);

    const { data: authUserProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type, email')
      .eq('email', authUserEmail)
      .maybeSingle();

    if (!authUserProfile) {
      console.log(`❌ No profile found for email: ${authUserEmail}`);
      return res.status(403).json({
        error: 'User profile not found',
        message: 'Please ensure your profile is set up properly.'
      });
    }

    let { userId, sessionCount } = req.body;
    const targetUserId = userId || authUserProfile.id;

    // Permission check for therapist viewing client data
    if (targetUserId !== authUserProfile.id) {
      console.log(`🔐 Checking permission: user ${authUserProfile.id} → target ${targetUserId}`);

      if (authUserProfile.user_type !== 'therapist') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Only therapists can analyze other users\' data'
        });
      }

      // Check therapist-client relationship
      const { data: relationship } = await supabase
        .from('therapist_client_relationships')
        .select('id, status')
        .eq('therapist_id', authUserProfile.id)
        .eq('client_id', targetUserId)
        .eq('status', 'active')
        .maybeSingle();

      let hasPermission = !!relationship;

      // Fallback: check invited_by
      if (!hasPermission) {
        const { data: clientProfile } = await supabase
          .from('user_profiles')
          .select('invited_by')
          .eq('id', targetUserId)
          .maybeSingle();

        hasPermission = clientProfile?.invited_by === authUserProfile.id;
      }

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to analyze this user\'s data'
        });
      }

      // Log therapist access
      await therapistDataService.logAccess(
        authUserProfile.id,
        targetUserId,
        'pca_analysis',
        undefined,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );
    }

    sessionCount = parseInt(sessionCount) || 3;
    if (sessionCount < 1 || sessionCount > 5) {
      return res.status(400).json({
        error: 'Session count must be between 1 and 5'
      });
    }

    console.log(`📊 PCA analysis requested for user ${targetUserId}, ${sessionCount} sessions`);

    const service = await getPCAService();
    const result = await service.performAnalysis(targetUserId, sessionCount);

    res.json({
      success: true,
      message: 'Analysis completed successfully',
      data: {
        analysisId: result.analysisId,
        currentCssStage: result.currentCssStage,
        safetyAssessment: result.safetyAssessment,
        registerDominance: result.registerDominance
      }
    });

  } catch (error: any) {
    console.error('❌ PCA analysis error:', error);

    if (error.message.includes('No transcripts')) {
      return res.status(404).json({
        error: 'No session transcripts found for analysis',
        message: 'Please complete at least one therapeutic session before requesting analysis.'
      });
    }

    res.status(500).json({
      error: 'Analysis failed',
      message: error.message || 'An unexpected error occurred during analysis'
    });
  }
});

/**
 * GET /api/analysis/pca-master/:analysisId
 * Retrieve a specific PCA analysis by ID (LEGACY)
 */
router.get('/pca-master/:analysisId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserEmail = req.user?.email;
    if (!authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', authUserEmail)
      .maybeSingle();

    if (!userProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    const { analysisId } = req.params;

    if (!analysisId) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    const service = await getPCAService();
    const analysis = await service.getAnalysis(userProfile.id, analysisId);

    res.json({
      success: true,
      data: analysis
    });

  } catch (error: any) {
    console.error('❌ Error fetching analysis:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Analysis not found',
        message: 'The requested analysis could not be found or does not belong to this user.'
      });
    }

    res.status(500).json({
      error: 'Failed to fetch analysis',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/analysis/pca-master
 * Get all PCA analyses for authenticated user (LEGACY)
 */
router.get('/pca-master', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user?.id;
    const authUserEmail = req.user?.email;

    if (!authUserId || !authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { data: authUserProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type, email')
      .eq('email', authUserEmail)
      .maybeSingle();

    if (!authUserProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    const targetUserId = (req.query.userId as string) || authUserProfile.id;

    // Permission check for therapist viewing client data
    if (targetUserId !== authUserProfile.id) {
      if (authUserProfile.user_type !== 'therapist') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Only therapists can view other users\' analyses'
        });
      }

      // Check relationship
      const { data: relationship } = await supabase
        .from('therapist_client_relationships')
        .select('id, status')
        .eq('therapist_id', authUserProfile.id)
        .eq('client_id', targetUserId)
        .eq('status', 'active')
        .maybeSingle();

      let hasPermission = !!relationship;

      if (!hasPermission) {
        const { data: clientProfile } = await supabase
          .from('user_profiles')
          .select('invited_by')
          .eq('id', targetUserId)
          .maybeSingle();

        hasPermission = clientProfile?.invited_by === authUserProfile.id;
      }

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to view this user\'s analyses'
        });
      }

      // Log therapist access
      await therapistDataService.logAccess(
        authUserProfile.id,
        targetUserId,
        'pca_analysis',
        undefined,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const service = await getPCAService();
    const analyses = await service.getUserAnalyses(targetUserId, limit);

    res.json({
      success: true,
      count: analyses.length,
      data: analyses
    });

  } catch (error: any) {
    console.error('❌ Error fetching analyses:', error);
    res.status(500).json({
      error: 'Failed to fetch analyses',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/analysis/debug-user
 * Debug endpoint to check authenticated user's profile and IDs
 */
router.get('/debug-user', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user?.id;
    const authUserEmail = req.user?.email;

    const results = {
      authInfo: {
        supabaseAuthId: authUserId,
        email: authUserEmail
      },
      profileLookup: {} as any
    };

    if (authUserEmail) {
      const { data: profileByEmail } = await supabase
        .from('user_profiles')
        .select('id, email, user_type, full_name, invited_by')
        .eq('email', authUserEmail)
        .maybeSingle();

      results.profileLookup.byEmail = profileByEmail;
    }

    res.json(results);

  } catch (error: any) {
    console.error('❌ Error in debug-user:', error);
    res.status(500).json({
      error: 'Debug check failed',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

export default router;
