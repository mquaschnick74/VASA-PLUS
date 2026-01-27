// Location: server/routes/push-notification-routes.ts
// API routes for push notification device token registration and preferences management

import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';

const router = Router();

// Valid platforms
const VALID_PLATFORMS = ['ios', 'android', 'web'];

// Valid notification types
const VALID_NOTIFICATION_TYPES = ['session_reminder', 'therapeutic_followup', 'announcement'];

// ============================================================================
// DEVICE TOKEN ROUTES
// ============================================================================

/**
 * Register a device token for push notifications
 * POST /api/push-notifications/register-token
 */
router.post('/register-token', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { token, platform, device_model, os_version, app_version } = req.body;

    // Validate required fields
    if (!token || !platform) {
      return res.status(400).json({ error: 'Token and platform are required' });
    }

    // Validate platform
    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}`
      });
    }

    // Get user's internal ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', req.user.id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user:', userError);
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userData.id;

    // Check if token already exists for this user
    const { data: existingToken, error: existingError } = await supabase
      .from('device_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .single();

    if (existingToken) {
      // Update existing token
      const { error: updateError } = await supabase
        .from('device_tokens')
        .update({
          platform,
          device_model,
          os_version,
          app_version,
          is_active: true,
          failed_delivery_count: 0,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingToken.id);

      if (updateError) {
        console.error('Error updating device token:', updateError);
        return res.status(500).json({ error: 'Failed to update device token' });
      }

      console.log('✅ Device token updated for user:', userId);
      return res.json({ success: true, message: 'Device token updated' });
    }

    // Deactivate any existing tokens for this user on the same platform
    // (user can only have one active token per platform)
    await supabase
      .from('device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('is_active', true);

    // Insert new token
    const { error: insertError } = await supabase
      .from('device_tokens')
      .insert({
        user_id: userId,
        token,
        platform,
        device_model,
        os_version,
        app_version,
        is_active: true,
        last_used_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error inserting device token:', insertError);
      return res.status(500).json({ error: 'Failed to register device token' });
    }

    console.log('✅ Device token registered for user:', userId);
    res.json({ success: true, message: 'Device token registered' });
  } catch (error) {
    console.error('Device token registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Unregister a device token
 * DELETE /api/push-notifications/unregister-token
 */
router.delete('/unregister-token', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Get user's internal ID
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', req.user.id)
      .single();

    if (userError || !userData) {
      console.error('Error fetching user:', userError);
      return res.status(404).json({ error: 'User not found' });
    }

    // Deactivate the token (soft delete)
    const { error: updateError } = await supabase
      .from('device_tokens')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userData.id)
      .eq('token', token);

    if (updateError) {
      console.error('Error unregistering device token:', updateError);
      return res.status(500).json({ error: 'Failed to unregister device token' });
    }

    console.log('✅ Device token unregistered for user:', userData.id);
    res.json({ success: true, message: 'Device token unregistered' });
  } catch (error) {
    console.error('Device token unregistration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// PUSH NOTIFICATION PREFERENCES ROUTES
// ============================================================================

/**
 * Get user's push notification preferences
 * GET /api/push-notifications/preferences/:userId
 */
router.get('/preferences/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user is accessing their own preferences
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', req.user.id)
      .single();

    if (userError || !userData || userData.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Fetch preferences
    const { data: prefs, error } = await supabase
      .from('user_push_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching push preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch preferences' });
    }

    // If no preferences exist, create defaults
    if (!prefs) {
      const defaultPrefs = {
        user_id: userId,
        push_notifications_enabled: true,
        session_reminders_enabled: true,
        therapeutic_followups_enabled: true,
        announcements_enabled: true,
        reminder_minutes_before: 30,
        quiet_hours_enabled: false,
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00'
      };

      const { data: newPrefs, error: createError } = await supabase
        .from('user_push_notification_preferences')
        .insert(defaultPrefs)
        .select()
        .single();

      if (createError) {
        console.error('Error creating push preferences:', createError);
        return res.status(500).json({ error: 'Failed to create preferences' });
      }

      return res.json({ preferences: newPrefs });
    }

    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Push preferences fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Update user's push notification preferences
 * PUT /api/push-notifications/preferences/:userId
 */
router.put('/preferences/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user is updating their own preferences
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', req.user.id)
      .single();

    if (userError || !userData || userData.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
      push_notifications_enabled,
      session_reminders_enabled,
      therapeutic_followups_enabled,
      announcements_enabled,
      reminder_minutes_before,
      quiet_hours_enabled,
      quiet_hours_start,
      quiet_hours_end
    } = req.body;

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (typeof push_notifications_enabled === 'boolean') {
      updateData.push_notifications_enabled = push_notifications_enabled;
    }
    if (typeof session_reminders_enabled === 'boolean') {
      updateData.session_reminders_enabled = session_reminders_enabled;
    }
    if (typeof therapeutic_followups_enabled === 'boolean') {
      updateData.therapeutic_followups_enabled = therapeutic_followups_enabled;
    }
    if (typeof announcements_enabled === 'boolean') {
      updateData.announcements_enabled = announcements_enabled;
    }
    if (typeof reminder_minutes_before === 'number' && reminder_minutes_before > 0) {
      updateData.reminder_minutes_before = reminder_minutes_before;
    }
    if (typeof quiet_hours_enabled === 'boolean') {
      updateData.quiet_hours_enabled = quiet_hours_enabled;
    }
    if (typeof quiet_hours_start === 'string') {
      // Validate time format (HH:MM)
      if (/^\d{2}:\d{2}$/.test(quiet_hours_start)) {
        updateData.quiet_hours_start = quiet_hours_start;
      }
    }
    if (typeof quiet_hours_end === 'string') {
      // Validate time format (HH:MM)
      if (/^\d{2}:\d{2}$/.test(quiet_hours_end)) {
        updateData.quiet_hours_end = quiet_hours_end;
      }
    }

    // Check if preferences exist
    const { data: existingPrefs, error: fetchError } = await supabase
      .from('user_push_notification_preferences')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error checking preferences:', fetchError);
      return res.status(500).json({ error: 'Failed to check preferences' });
    }

    let result;

    if (existingPrefs) {
      // Update existing preferences
      const { data: prefs, error: updateError } = await supabase
        .from('user_push_notification_preferences')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating push preferences:', updateError);
        return res.status(500).json({ error: 'Failed to update preferences' });
      }
      result = prefs;
    } else {
      // Create new preferences with provided values
      const newPrefs = {
        user_id: userId,
        push_notifications_enabled: push_notifications_enabled ?? true,
        session_reminders_enabled: session_reminders_enabled ?? true,
        therapeutic_followups_enabled: therapeutic_followups_enabled ?? true,
        announcements_enabled: announcements_enabled ?? true,
        reminder_minutes_before: reminder_minutes_before ?? 30,
        quiet_hours_enabled: quiet_hours_enabled ?? false,
        quiet_hours_start: quiet_hours_start ?? '22:00',
        quiet_hours_end: quiet_hours_end ?? '08:00'
      };

      const { data: prefs, error: insertError } = await supabase
        .from('user_push_notification_preferences')
        .insert(newPrefs)
        .select()
        .single();

      if (insertError) {
        console.error('Error creating push preferences:', insertError);
        return res.status(500).json({ error: 'Failed to create preferences' });
      }
      result = prefs;
    }

    console.log('✅ Push preferences updated for user:', userId);
    res.json({ preferences: result });
  } catch (error) {
    console.error('Push preferences update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// INTERNAL ROUTES (for Supabase Edge Functions to call)
// ============================================================================

/**
 * Get active device tokens for a user
 * Used by Supabase Edge Functions to send notifications
 * GET /api/push-notifications/internal/tokens/:userId
 */
router.get('/internal/tokens/:userId', async (req, res) => {
  try {
    // Verify internal API key (should be set in environment)
    const apiKey = req.headers['x-internal-api-key'];
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    if (!expectedApiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { userId } = req.params;

    // Fetch active device tokens for the user
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('id, token, platform')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching device tokens:', error);
      return res.status(500).json({ error: 'Failed to fetch device tokens' });
    }

    res.json({ tokens: tokens || [] });
  } catch (error) {
    console.error('Internal tokens fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Check if a user should receive a notification type
 * Used by Supabase Edge Functions before sending
 * GET /api/push-notifications/internal/should-notify/:userId/:notificationType
 */
router.get('/internal/should-notify/:userId/:notificationType', async (req, res) => {
  try {
    // Verify internal API key
    const apiKey = req.headers['x-internal-api-key'];
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    if (!expectedApiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { userId, notificationType } = req.params;

    // Validate notification type
    if (!VALID_NOTIFICATION_TYPES.includes(notificationType)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    // Fetch user's push notification preferences
    const { data: prefs, error } = await supabase
      .from('user_push_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch preferences' });
    }

    // Default to allowing notifications if no preferences set
    if (!prefs) {
      return res.json({ shouldNotify: true, reason: 'no_preferences_set' });
    }

    // Check if push notifications are globally disabled
    if (!prefs.push_notifications_enabled) {
      return res.json({ shouldNotify: false, reason: 'push_disabled' });
    }

    // Check specific notification type
    let typeEnabled = true;
    switch (notificationType) {
      case 'session_reminder':
        typeEnabled = prefs.session_reminders_enabled;
        break;
      case 'therapeutic_followup':
        typeEnabled = prefs.therapeutic_followups_enabled;
        break;
      case 'announcement':
        typeEnabled = prefs.announcements_enabled;
        break;
    }

    if (!typeEnabled) {
      return res.json({ shouldNotify: false, reason: `${notificationType}_disabled` });
    }

    // Check quiet hours
    if (prefs.quiet_hours_enabled) {
      const now = new Date();
      const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

      const start = prefs.quiet_hours_start;
      const end = prefs.quiet_hours_end;

      // Check if current time is within quiet hours
      let inQuietHours = false;
      if (start <= end) {
        // Simple case: quiet hours don't span midnight
        inQuietHours = currentTime >= start && currentTime <= end;
      } else {
        // Quiet hours span midnight (e.g., 22:00 to 08:00)
        inQuietHours = currentTime >= start || currentTime <= end;
      }

      if (inQuietHours) {
        return res.json({ shouldNotify: false, reason: 'quiet_hours' });
      }
    }

    // All checks passed
    res.json({
      shouldNotify: true,
      reminderMinutesBefore: prefs.reminder_minutes_before
    });
  } catch (error) {
    console.error('Should notify check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Log notification delivery result
 * Used by Supabase Edge Functions after sending
 * POST /api/push-notifications/internal/log-delivery
 */
router.post('/internal/log-delivery', async (req, res) => {
  try {
    // Verify internal API key
    const apiKey = req.headers['x-internal-api-key'];
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    if (!expectedApiKey || apiKey !== expectedApiKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      user_id,
      device_token_id,
      title,
      body,
      notification_type,
      delivery_status,
      apns_id,
      error_code,
      error_message,
      data
    } = req.body;

    // Insert notification history record
    const { error: insertError } = await supabase
      .from('notification_history')
      .insert({
        user_id,
        device_token_id,
        title,
        body,
        notification_type,
        delivery_status,
        apns_id,
        error_code,
        error_message,
        data: data || {}
      });

    if (insertError) {
      console.error('Error logging notification delivery:', insertError);
      return res.status(500).json({ error: 'Failed to log delivery' });
    }

    // If delivery failed, increment failed_delivery_count on device token
    if (delivery_status === 'failed' && device_token_id) {
      const { data: tokenData } = await supabase
        .from('device_tokens')
        .select('failed_delivery_count')
        .eq('id', device_token_id)
        .single();

      if (tokenData) {
        const newCount = (tokenData.failed_delivery_count || 0) + 1;

        // If too many failures, deactivate the token
        const update: Record<string, any> = {
          failed_delivery_count: newCount,
          updated_at: new Date().toISOString()
        };

        // Deactivate after 5 consecutive failures
        if (newCount >= 5) {
          update.is_active = false;
        }

        await supabase
          .from('device_tokens')
          .update(update)
          .eq('id', device_token_id);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Log delivery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
