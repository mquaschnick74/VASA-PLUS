# VASA Orchestration System Documentation

## Overview
VASA (Voice-Activated Specialist Assistance) is an advanced therapeutic voice assistant that employs invisible multi-agent orchestration with narrative primacy integration. The system seamlessly switches between four specialized AI therapists based on detected conversational patterns while maintaining a coherent narrative therapeutic approach.

## Core Architecture

### 1. Four Therapeutic Agents

#### Sarah - Emotional Support Specialist
- **Specialization**: CVDC (Constant Variably Determined Contradiction) patterns
- **Approach**: Warm, emotionally supportive, feeling-first methodology
- **Triggers**:
  - Multiple contradictions detected (≥2 CVDC patterns)
  - High emotional intensity without crisis
  - Narrative fragmentation ≥4 (needs emotional coherence)
  - Post-crisis stabilization from Zhanna

#### Mathew - Behavioral Analysis Expert
- **Specialization**: IBM (Incoherent Behavior Matrix) patterns
- **Approach**: Analytical, pattern-recognition focused, intention-action gap explorer
- **Triggers**:
  - Behavioral gaps detected (≥1 IBM patterns)
  - Temporal orientation stuck in past
  - Intention-behavior mismatches
  - Past narrative patterns requiring examination

#### Marcus - Integration Specialist
- **Specialization**: Thend states and CYVC (Constant Yet Variable Conclusion)
- **Approach**: Philosophical, pattern synthesis, meta-cognitive exploration
- **Triggers**:
  - Integration opportunities (≥1 Thend patterns)
  - High symbolic density (≥5)
  - Rich symbolic narrative requiring exploration
  - Emerging choice patterns (CYVC)

#### Zhanna - Somatic & Crisis Specialist
- **Specialization**: HSFB (Hearing, Seeing, Feeling, Breathing) protocols
- **Approach**: Grounding, somatic awareness, crisis stabilization
- **Triggers**:
  - High distress level (≥5)
  - Somatic patterns detected (≥1)
  - High narrative fragmentation (≥7)
  - Crisis situations or acute distress

### 2. CSS Pattern Detection System

The system detects four primary therapeutic pattern types:

- **CVDC (Contradictions)**: Opposing desires, conflicting feelings, "part of me" language
- **IBM (Behavioral Gaps)**: Intention-action mismatches, self-care deficits, procrastination
- **Thend (Integration)**: Moments of insight, shifts in perspective, emerging understanding
- **CYVC (Choice/Flexibility)**: New possibilities, increased agency, flexible conclusions

### 3. Narrative Primacy Integration (v5)

All therapeutic work is framed as narrative-based therapy with the following metrics:

#### Narrative Fragmentation Score (0-10)
- Measures story coherence and contradiction density
- High fragmentation (≥7) triggers Zhanna for grounding
- Mid-range (4-6) suggests Sarah for emotional coherence
- Low scores indicate integrated narrative

#### Symbolic Density (0-10)
- Tracks metaphor usage, symbolic language, archetypal references
- High density (≥5) routes to Marcus for philosophical exploration
- Indicates depth of symbolic processing

#### Temporal Orientation
- **Present**: Current awareness and immediacy
- **Past**: Historical patterns and memories
- **Future**: Goals, fears, and anticipation
- **Stuck_past**: Repetitive past narratives (triggers Mathew)
- **Emerging_future**: New possibilities (triggers Marcus)

### 4. Orchestration Logic

#### Agent Switching Rules
- **Cooldown Period**: 30 seconds between switches (reduced from 2 minutes)
- **Confidence Thresholds**: 0.6-0.9 based on pattern strength
- **Priority Hierarchy**:
  1. Crisis/Safety (Zhanna) - Override all others
  2. High Distress (Sarah/Zhanna) - Emotional stabilization
  3. Pattern-Based (Context-dependent) - Therapeutic opportunity
  4. Integration (Marcus) - When stable and ready

#### Seamless Transitions
- No announcement of agent changes to user
- Continuous conversation flow maintained
- Memory context preserved across switches
- Narrative continuity emphasized

### 5. Memory & Context System

#### Session Management
- Two-tier cache: ActiveSessions Map + CheckedSessions Set
- Race condition protection with Promise-based locks
- 30-minute stale session cleanup
- Duplicate prevention via transcript hashing

#### Context Building
- Previous session summaries with narrative framing
- Key insights tracked as "story chapters"
- Pattern history maintained across sessions
- Therapeutic journey phases: Building → Deepening → Integrating

### 6. Pattern Guidance System

Real-time therapeutic guidance injection based on:
- Pattern counts and priorities
- Narrative phase awareness
- Session progression tracking
- Adaptive polling intervals (3-15 seconds)

## Technical Implementation

### Database Schema
```sql
therapeutic_sessions     -- Voice session metadata
therapeutic_context      -- Persistent memory/insights  
session_transcripts      -- Full conversation history
css_patterns            -- Pattern detection with narrative metrics
users                   -- User profiles
```

### API Endpoints
- `/api/vapi/orchestration/state` - Get current orchestration state
- `/api/vapi/orchestration/session` - Initialize session
- `/api/vapi/orchestration/guidance-applied` - Mark guidance as applied
- `/api/vapi/webhook` - VAPI webhook handler for real-time processing

### Frontend Integration
- WebSocket connection for real-time voice
- Pattern polling with adaptive intervals
- Seamless agent switching without UI changes
- Narrative phase injection into prompts

## Monitoring & Metrics

### Key Performance Indicators
- Pattern detection accuracy
- Agent switch appropriateness
- Session continuity maintenance
- Narrative coherence scores
- User engagement metrics

### Debug Logging
- Pattern detection: `🎯 Pattern detected`
- Agent switching: `🔄 Suggesting [Agent]`
- Narrative state: `📖 Narrative phase`
- Memory injection: `💉 Memory context`
- Orchestration state: `📊 State update`

## Configuration

### Environmental Variables
- `VAPI_SECRET_KEY` - VAPI platform authentication
- `VITE_VAPI_PUBLIC_KEY` - Frontend VAPI key
- `DATABASE_URL` - PostgreSQL connection
- `SUPABASE_URL` - Supabase service endpoint
- `SUPABASE_SERVICE_KEY` - Supabase authentication

### Agent Models
All agents use OpenAI GPT-4 with customized parameters:
- Temperature: 0.85-0.95 (varies by agent)
- Max tokens: 150-250
- Voice speed: 0.85-1.0 (adjusted for therapeutic pacing)

## Future Enhancements

### Planned Features
- Visual pattern analytics dashboard
- Multi-language support
- Group therapy session handling
- Advanced crisis detection algorithms
- Therapist supervision interface

### Research Areas
- Improved narrative coherence algorithms
- Cross-cultural pattern adaptation
- Long-term therapeutic outcome tracking
- Integration with clinical assessment tools

## Compliance & Ethics

### Privacy
- End-to-end encryption for voice data
- Minimal data retention policies
- User-controlled data deletion
- HIPAA-compliant infrastructure

### Safety
- Crisis hotline integration
- Mandatory safety disclaimers
- Human therapist handoff protocols
- Regular safety audit procedures

## Version History

### v5.0 (Current)
- Narrative Primacy Module integration
- Enhanced pattern detection with narrative metrics
- Improved agent switching logic
- Reduced cooldown periods for responsiveness

### v4.0
- Four-agent system implementation
- Advanced CSS pattern detection
- Memory context system
- Real-time orchestration

### v3.0
- Natural voice with speak/meta separation
- Crisis module integration
- Enhanced somatic awareness

## Support & Documentation

For additional information:
- Technical issues: Review server logs and browser console
- Pattern detection: Check css-pattern-service.ts
- Agent configuration: See agent-configs.ts
- Memory system: Examine memory-service.ts
- Orchestration logic: Reference orchestration-service.ts