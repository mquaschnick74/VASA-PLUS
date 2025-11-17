import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';

const router = Router();

// Get user's email preferences
router.get('/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    // Verify user is accessing their own preferences
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', req.user?.email)
      .single();

    if (!userProfile || userProfile.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { data: prefs, error } = await supabase
      .from('user_email_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching email preferences:', error);
      return res.status(500).json({ error: 'Failed to fetch preferences' });
    }

    // If no preferences exist, create default
    if (!prefs) {
      const { data: newPrefs, error: createError } = await supabase
        .from('user_email_preferences')
        .insert({
          user_id: userId,
          weekly_recap_enabled: true,
          preferred_meditation_voice: 'sarah',
          meditation_rotation_state: {
            used: [],
            available: ['campfire', 'ocean', 'singing_bowl']
          }
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating preferences:', createError);
        return res.status(500).json({ error: 'Failed to create preferences' });
      }

      return res.json({ preferences: newPrefs });
    }

    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Email preferences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user's email preferences
router.put('/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { weekly_recap_enabled, preferred_meditation_voice } = req.body;

    // Verify user is updating their own preferences
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', req.user?.email)
      .single();

    if (!userProfile || userProfile.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Validate voice preference
    if (preferred_meditation_voice && !['sarah', 'mathew'].includes(preferred_meditation_voice)) {
      return res.status(400).json({
        error: 'Invalid meditation voice. Must be "sarah" or "mathew"'
      });
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (typeof weekly_recap_enabled === 'boolean') {
      updateData.weekly_recap_enabled = weekly_recap_enabled;
    }

    if (preferred_meditation_voice) {
      updateData.preferred_meditation_voice = preferred_meditation_voice;
    }

    const { data: prefs, error } = await supabase
      .from('user_email_preferences')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating preferences:', error);
      return res.status(500).json({ error: 'Failed to update preferences' });
    }

    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Email preferences update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
