// Location: server/routes/pca-analysis-routes.ts
// API routes for PCA Master Analyst feature

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import { therapistDataService } from '../services/therapist-data-service';

const router = Router();

// Truly lazy service loading - only import the module when actually needed
// This prevents ANY module resolution at server startup
let _serviceInstance: any = null;
async function getPCAService() {
  if (!_serviceInstance) {
    // Dynamic import - only loads when this function is called
    // Omit extension for tsx to resolve .ts files correctly
    const { PCAMasterAnalystService } = await import('../services/pca-master-analyst-service');
    _serviceInstance = new PCAMasterAnalystService();
  }
  return _serviceInstance;
}

/**
 * POST /api/analysis/pca-master
 * Trigger PCA master analysis for authenticated user
 *
 * Body:
 *   - sessionCount: number (1-5, default 3) - Number of recent sessions to analyze
 */
router.post('/pca-master', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user?.id;  // Supabase auth ID
    const authUserEmail = req.user?.email;

    if (!authUserId || !authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`🔍 Auth info: id=${authUserId}, email=${authUserEmail}`);

    // Get authenticated user's profile using email (established pattern in codebase)
    // Note: req.user.id is Supabase auth ID, but user_profiles.id is profile ID
    // The link between them is the email address
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

    console.log(`✅ Found profile: id=${authUserProfile.id}, type=${authUserProfile.user_type}`);

    // Get target userId from request body (for therapist viewing client data)
    // If not provided, analyze the authenticated user's own data
    let { userId, sessionCount } = req.body;
    const targetUserId = userId || authUserProfile.id;

    // If analyzing a different user, verify permission (therapist-client relationship)
    if (targetUserId !== authUserProfile.id) {
      console.log(`🔐 Checking permission: user ${authUserProfile.id} (${authUserProfile.user_type}) → target ${targetUserId}`);

      // Only therapists can analyze other users' data
      if (authUserProfile.user_type !== 'therapist') {
        console.log(`❌ Non-therapist (${authUserProfile.user_type}) trying to analyze another user's data`);
        return res.status(403).json({
          error: 'Access denied',
          message: 'Only therapists can analyze other users\' data'
        });
      }

      let hasPermission = false;

      // Method 1: Check therapist_client_relationships table (new system)
      const { data: relationship } = await supabase
        .from('therapist_client_relationships')
        .select('id, status')
        .eq('therapist_id', authUserProfile.id)
        .eq('client_id', targetUserId)
        .eq('status', 'active')
        .maybeSingle();

      if (relationship) {
        console.log(`✅ Therapist ${authUserProfile.id} authorized via therapist_client_relationships`);
        hasPermission = true;
      }

      // Method 2: Fallback check - user_profiles.invited_by field (legacy system)
      if (!hasPermission) {
        const { data: clientProfile } = await supabase
          .from('user_profiles')
          .select('invited_by')
          .eq('id', targetUserId)
          .maybeSingle();

        if (clientProfile?.invited_by === authUserProfile.id) {
          console.log(`✅ Therapist ${authUserProfile.id} authorized via user_profiles.invited_by (legacy)`);
          hasPermission = true;
        }
      }

      if (!hasPermission) {
        console.log(`❌ No valid relationship found for therapist ${authUserProfile.id} → client ${targetUserId}`);
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to analyze this user\'s data'
        });
      }

      console.log(`✅ Permission granted for therapist ${authUserProfile.id} to analyze client ${targetUserId}`);

      // Log therapist access to client's PCA analysis
      await therapistDataService.logAccess(
        authUserProfile.id,
        targetUserId,
        'pca_analysis',
        undefined,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent']
      );
    } else {
      console.log(`✅ Self-analysis: user ${authUserProfile.id} analyzing own data`);
    }

    // Get session count from request body, default to 3
    sessionCount = parseInt(sessionCount) || 3;

    // Validate session count range
    if (sessionCount < 1 || sessionCount > 5) {
      return res.status(400).json({
        error: 'Session count must be between 1 and 5'
      });
    }

    console.log(`📊 PCA analysis requested for user ${targetUserId}, ${sessionCount} sessions`);

    // Get service instance and perform analysis
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

    // Handle specific error cases
    if (error.message.includes('No transcripts')) {
      return res.status(404).json({
        error: 'No session transcripts found for analysis',
        message: 'Please complete at least one therapeutic session before requesting analysis.'
      });
    }

    if (error.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(500).json({
        error: 'Service configuration error',
        message: 'PCA analysis service is not properly configured. Please contact support.'
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
 * Retrieve a specific PCA analysis by ID
 */
router.get('/pca-master/:analysisId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserEmail = req.user?.email;
    if (!authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user's profile ID using email
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

    console.log(`📖 Fetching analysis ${analysisId} for user ${userProfile.id}`);

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
 * Get all PCA analyses for authenticated user or specified user (with permission)
 *
 * Query params:
 *   - userId: string (optional) - User ID to fetch analyses for (therapist must have permission)
 *   - limit: number (default 10) - Maximum number of analyses to return
 */
router.get('/pca-master', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user?.id;  // Supabase auth ID
    const authUserEmail = req.user?.email;

    if (!authUserId || !authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get authenticated user's profile using email
    const { data: authUserProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type, email')
      .eq('email', authUserEmail)
      .maybeSingle();

    if (!authUserProfile) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    // Get target userId from query params (for therapist viewing client data)
    const targetUserId = (req.query.userId as string) || authUserProfile.id;

    // If fetching analyses for a different user, verify permission
    if (targetUserId !== authUserProfile.id) {
      console.log(`🔐 Checking permission: user ${authUserProfile.id} (${authUserProfile.user_type}) → target ${targetUserId}`);

      // Only therapists can fetch other users' analyses
      if (authUserProfile.user_type !== 'therapist') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Only therapists can view other users\' analyses'
        });
      }

      let hasPermission = false;

      // Method 1: Check therapist_client_relationships table
      const { data: relationship } = await supabase
        .from('therapist_client_relationships')
        .select('id, status')
        .eq('therapist_id', authUserProfile.id)
        .eq('client_id', targetUserId)
        .eq('status', 'active')
        .maybeSingle();

      if (relationship) {
        hasPermission = true;
      }

      // Method 2: Fallback check - user_profiles.invited_by field
      if (!hasPermission) {
        const { data: clientProfile } = await supabase
          .from('user_profiles')
          .select('invited_by')
          .eq('id', targetUserId)
          .maybeSingle();

        if (clientProfile?.invited_by === authUserProfile.id) {
          hasPermission = true;
        }
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

    console.log(`📋 Fetching analyses for user ${targetUserId} (limit: ${limit})`);

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
    const authUserId = req.user?.id;  // Supabase auth ID
    const authUserEmail = req.user?.email;

    const results = {
      authInfo: {
        supabaseAuthId: authUserId,
        email: authUserEmail
      },
      profileLookup: {} as any
    };

    if (authUserEmail) {
      // Check user_profiles by email
      const { data: profileByEmail } = await supabase
        .from('user_profiles')
        .select('id, email, user_type, full_name, invited_by')
        .eq('email', authUserEmail)
        .maybeSingle();

      results.profileLookup.byEmail = profileByEmail;
    }

    if (authUserId) {
      // Check user_profiles by ID (will likely not find anything)
      const { data: profileById } = await supabase
        .from('user_profiles')
        .select('id, email, user_type, full_name, invited_by')
        .eq('id', authUserId)
        .maybeSingle();

      results.profileLookup.byAuthId = profileById;
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

/**
 * GET /api/analysis/debug-permission/:clientId
 * Debug endpoint to check all relationship types between authenticated user and target user
 * Helps troubleshoot permission issues
 */
router.get('/debug-permission/:clientId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user?.id;  // Supabase auth ID
    const authUserEmail = req.user?.email;
    const { clientId } = req.params;

    if (!authUserId || !authUserEmail) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get authenticated user's profile using email
    const { data: authUserProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type, email, full_name')
      .eq('email', authUserEmail)
      .maybeSingle();

    if (!authUserProfile) {
      return res.status(403).json({
        error: 'User profile not found',
        authEmail: authUserEmail,
        note: 'Profile lookup by email failed'
      });
    }

    // Get target user's profile
    const { data: targetUserProfile } = await supabase
      .from('user_profiles')
      .select('id, user_type, email, full_name, invited_by')
      .eq('id', clientId)
      .maybeSingle();

    // Check all relationship types
    const checks = {
      authenticatedUser: {
        supabaseAuthId: authUserId,
        profileId: authUserProfile.id,
        email: authUserProfile.email,
        name: authUserProfile.full_name,
        type: authUserProfile.user_type
      },
      targetUser: targetUserProfile ? {
        id: targetUserProfile.id,
        email: targetUserProfile.email,
        name: targetUserProfile.full_name,
        type: targetUserProfile.user_type,
        invited_by: targetUserProfile.invited_by
      } : null,
      checks: {
        isSelfAnalysis: authUserProfile.id === clientId,
        isTherapist: authUserProfile.user_type === 'therapist',
        canAnalyzeOthers: authUserProfile.user_type === 'therapist'
      },
      relationships: {
        therapist_client_relationships: null as any,
        invited_by_matches: false,
        pendingInvitations: null as any
      },
      verdict: 'DENIED',
      reason: ''
    };

    // If analyzing self, always allowed
    if (authUserProfile.id === clientId) {
      checks.verdict = 'ALLOWED';
      checks.reason = 'Self-analysis is always permitted';
      return res.json(checks);
    }

    // Only therapists can analyze others
    if (authUserProfile.user_type !== 'therapist') {
      checks.verdict = 'DENIED';
      checks.reason = 'Only therapists can analyze other users';
      return res.json(checks);
    }

    // Check therapist_client_relationships table
    const { data: relationship } = await supabase
      .from('therapist_client_relationships')
      .select('*')
      .eq('therapist_id', authUserProfile.id)
      .eq('client_id', clientId);

    checks.relationships.therapist_client_relationships = relationship;

    if (relationship && relationship.length > 0 && relationship[0].status === 'active') {
      checks.verdict = 'ALLOWED';
      checks.reason = 'Active relationship found in therapist_client_relationships table';
      return res.json(checks);
    }

    // Check invited_by field (legacy)
    if (targetUserProfile?.invited_by === authUserProfile.id) {
      checks.relationships.invited_by_matches = true;
      checks.verdict = 'ALLOWED';
      checks.reason = 'Client was invited by this therapist (legacy user_profiles.invited_by)';
      return res.json(checks);
    }

    // Check pending invitations for additional context
    const { data: invitations } = await supabase
      .from('therapist_invitations')
      .select('*')
      .eq('therapist_id', authUserProfile.id)
      .eq('client_email', targetUserProfile?.email || '');

    checks.relationships.pendingInvitations = invitations;

    checks.verdict = 'DENIED';
    checks.reason = 'No valid relationship found between therapist and client';

    res.json(checks);

  } catch (error: any) {
    console.error('❌ Error in debug-permission:', error);
    res.status(500).json({
      error: 'Debug check failed',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

export default router;
