import { Router } from 'express';
import { supabase } from '../services/supabase-service';
import { generateCSSProgressionSummary } from '../services/summary-service';

const router = Router();

// Create test transcript and generate CSS summary
router.post('/test-css-generation/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Sample therapeutic transcript demonstrating CSS patterns
    const sampleTranscript = `
Sarah: Hello Sophia, I notice we're connecting again. What's most present for you today?

Sophia: I've been feeling really stuck lately. Part of me wants to reach out to my ex, but another part knows that's not healthy for me.

Sarah: I hear two different truths you're holding - the part that wants connection and the part that knows distance is protective. Can you tell me more about each side?

Sophia: The part that wants to reach out feels so lonely. It remembers all the good times, the comfort. But the other part remembers the pain, the patterns that kept repeating. It's like I'm split in two.

Sarah: You're describing a living contradiction - both the longing for connection and the need for protection. Where do you feel this split in your body?

Sophia: It's like a tightness in my chest. The longing feels warm but the protection feels like a wall, cold and hard.

Sarah: So there's warmth and coldness, openness and closure, both existing in your chest right now. What happens if we don't try to resolve this, if we just let both be true?

Sophia: That's hard... but when I try, it's like... they're both trying to keep me safe in different ways.

Sarah: Yes, that's the binding element - both sides are protective. The longing protects you from isolation, the distance protects you from harm. Can you hold both as equally valid?

Sophia: When I think about it that way, they don't feel as opposed. They're both... care. Different forms of self-care.

Sarah: Something just shifted in how you're holding this contradiction. What feels different now?

Sophia: It's less of a battle. More like... two friends disagreeing but both wanting what's best for me.

Sarah: That's a beautiful reframe. The contradiction remains but the relationship to it has transformed. How does this new understanding feel in your body?

Sophia: Lighter. The chest isn't as tight. Still complex but... softer somehow.
`;

    // Get the most recent session for this user to use its call_id
    const { data: session } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'No sessions found for user' });
    }

    // Save the test transcript
    const { data: transcript, error: transcriptError } = await supabase
      .from('session_transcripts')
      .insert({
        user_id: userId,
        call_id: session.call_id,
        text: sampleTranscript
      })
      .select()
      .single();

    if (transcriptError) {
      console.error('Error creating transcript:', transcriptError);
      return res.status(500).json({ error: 'Failed to create test transcript' });
    }

    // Generate CSS summary
    console.log(`📝 Generating CSS summary for test transcript...`);
    const summary = await generateCSSProgressionSummary(
      userId,
      session.call_id,
      sampleTranscript,
      'Sarah'
    );

    // Check if CSS summary was created
    const { data: cssContext } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .eq('context_type', 'css_summary')
      .eq('call_id', session.call_id)
      .single();

    res.json({
      success: true,
      message: 'Test transcript and CSS summary created successfully',
      transcript: {
        id: transcript.id,
        call_id: session.call_id,
        text_length: sampleTranscript.length
      },
      cssContext: cssContext ? {
        created: true,
        content_preview: cssContext.content.substring(0, 500),
        css_stage: cssContext.css_stage
      } : { created: false },
      summary: summary?.substring(0, 500) + '...'
    });

  } catch (error) {
    console.error('Error in test CSS generation:', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

export default router;