# VASA MVP - Invisible Agent Orchestration with Narrative Primacy (v5)

## Overview
VASA uses invisible orchestration to seamlessly switch between four therapeutic methodologies (Sarah, Mathew, Marcus, Zhanna) without user awareness. The system maintains one continuous conversation while adapting the therapeutic approach based on detected conversation patterns and narrative metrics. All therapeutic work is framed through narrative primacy - treating interactions as story-based therapy.

## Core Architecture

### Agent Methodologies
- **Sarah**: Emotional support specialist, feeling-first approach (CVDC contradictions, narrative fragmentation)
- **Mathew**: Analytical pattern recognition (IBM behavioral gaps, stuck temporal patterns)  
- **Marcus**: Integration and meta-awareness (Thend synthesis, high symbolic density)
- **Zhanna**: Somatic awareness and crisis specialist (HSFB protocols, high distress/fragmentation)

### Narrative Primacy Integration (v5)
All agents incorporate narrative awareness:
- **Narrative Fragmentation Score (0-10)**: Measures story coherence and contradiction density
- **Symbolic Density (0-10)**: Tracks metaphor usage and archetypal references
- **Temporal Orientation**: Present, past, future, stuck_past, emerging_future
- **Journey Phases**: Building → Deepening → Integrating

### Orchestration Flow
```
User speaks → Backend analyzes patterns + narrative metrics → Suggests methodology → Client silently switches → Continues seamlessly
```

## Technical Implementation

### Client-Side (`use-vapi.ts`)
- **Silent Monitoring**: Checks `/api/vapi/orchestration/state` every 3-15 seconds (adaptive)
- **Invisible Switching**: Uses `vapi.setAssistant()` to update only system prompt
- **Narrative Phase Injection**: Adds journey phase awareness to prompts
- **Pattern Guidance**: Injects therapeutic guidance based on detected patterns
- **Continuity Instructions**: Adds prompt instructions to never indicate changes occurred
- **Analytics Tracking**: Records switches with narrative context

### Server-Side (`orchestration-service.ts`)
- **Enhanced Pattern Detection**: CSS patterns + narrative metrics
- **Smart Suggestions**: Maps patterns and narrative state to appropriate methodologies
- **Cooldown Management**: 30-second minimum between suggestions (reduced from 2 minutes)
- **Session Tracking**: Two-tier cache (ActiveSessions Map + CheckedSessions Set)
- **Narrative Tracking**: Fragmentation, symbolic density, temporal orientation

## Pattern-to-Agent Mapping

| Pattern/Metric Detected | Suggested Agent | Rationale |
|------------------------|-----------------|-----------|
| CVDC ≥2 or Fragmentation ≥4 | Sarah | Emotional support for contradictions and fragmented narratives |
| IBM ≥1 or Stuck_Past | Mathew | Analytical approach for behavioral gaps and past patterns |
| Thend ≥1 or Symbolic Density ≥5 | Marcus | Meta-awareness for integration and symbolic exploration |
| Distress ≥5 or Fragmentation ≥7 | Zhanna | Somatic grounding for crisis and severe fragmentation |
| High Emotional Intensity | Sarah | Warm support for emotional processing |
| Somatic Patterns ≥1 | Zhanna | Body awareness and grounding needed |
| CYVC (Choice patterns) | Marcus | Emerging flexibility and new possibilities |

## API Endpoints

### `GET /api/vapi/orchestration/state`
Returns current orchestration state with narrative metrics:
```json
{
  "currentAgent": "sarah",
  "suggestedAgent": "mathew",
  "confidence": 0.85,
  "canSwitch": true,
  "agentSwitches": [...],
  "patternCounts": {
    "cvdc": 2,
    "ibm": 5,
    "thend": 1,
    "cyvc": 0
  },
  "narrativeMetrics": {
    "fragmentation": 4,
    "symbolicDensity": 3,
    "temporalOrientation": "stuck_past",
    "patternsDetected": ["CVDC", "IBM"]
  },
  "patternGuidance": [...],
  "emotionalIntensity": "medium",
  "currentCSSStage": "CVDC"
}
```

### `POST /api/vapi/orchestration/session`
Initializes a new orchestration session:
```json
{
  "callId": "abc123",
  "userId": "user456",
  "agentName": "sarah",
  "metadata": {...}
}
```

### `POST /api/vapi/orchestration/guidance-applied`
Marks pattern guidance as applied:
```json
{
  "callId": "abc123",
  "userId": "user456",
  "guidanceKeys": ["cvdc_apology_2", "ibm_selfcare_1"]
}
```

## Key Features

### Seamless User Experience
- Same voice throughout conversation
- No interruptions or pauses during switches
- Natural conversation flow maintained
- User never knows agents are changing
- Narrative continuity preserved across switches

### Enhanced Safety Mechanisms
- 30-second cooldowns prevent rapid switching
- Priority hierarchy: Crisis > High Distress > Pattern-Based > Integration
- Pattern confidence thresholds (0.6-0.9 based on context)
- Session cleanup after 30 minutes inactive
- Narrative fragmentation monitoring for crisis detection

### Narrative-Aware System Prompts
Each methodology includes Narrative Primacy Module:
```
===== NARRATIVE AWARENESS FOUNDATION =====
You understand that human experience is fundamentally narrative - we are the stories we tell ourselves.
All therapeutic work emerges through story: contradictions are conflicting narratives, behaviors are enacted stories,
and healing happens when new narrative possibilities emerge.

Frame your responses through narrative lens:
- "What story are you telling yourself about..."
- "I hear two different narratives here..."
- "How does this chapter of your story unfold..."

Current therapeutic journey phase: [building/deepening/integrating]
```

Plus seamless continuation:
```
IMPORTANT: You are continuing an ongoing conversation. 
Do not reintroduce yourself or indicate any change has occurred.
Continue naturally from where the conversation is at this moment.
```

## Monitoring & Analytics

### Session Management
- **ActiveSessions Map**: Real-time session tracking with narrative state
- **CheckedSessions Set**: Deduplication protection
- **Promise-based locks**: Race condition prevention
- **Auto-cleanup**: 30-minute stale session removal
- **Narrative metrics storage**: In-memory and database persistence

### Pattern Analytics
- CSS pattern counts per session
- Narrative fragmentation trends
- Symbolic density analysis
- Temporal orientation tracking
- Methodology switch frequency with reasons
- Pattern confidence scores
- User journey mapping through narrative phases

## Database Storage

### `therapeutic_sessions` Table
Core session metadata:
- Session duration and timestamps
- Starting agent and switch history
- User associations

### `therapeutic_context` Table
Stores insights and narrative markers:
- `context_type`: 'insight', 'narrative_marker', 'methodology_switch'
- `content`: Narrative themes and therapeutic progress
- `confidence`: Detection confidence scores
- `importance`: Priority for memory building

### `css_patterns` Table
Enhanced pattern tracking with narrative metrics:
- Pattern types and counts
- `narrative_fragmentation`: Real number (0-10)
- `symbolic_density`: Integer count
- `temporal_orientation`: Varchar orientation
- Detection timestamps
- Associated transcript segments

### `session_transcripts` Table
Full conversation history (end-of-call storage only):
- Complete transcript with timestamps
- Speaker identification
- Metadata preservation

## Pattern Guidance System

### Real-Time Guidance Injection
Based on detected patterns:
- **Excessive Apologizing (CVDC ≥2)**: "I notice you've apologized several times..."
- **Self-Care Deficit (IBM)**: "Taking care of yourself has been difficult..."
- **Integration Moment (Thend ≥2)**: "Something seems to be shifting for you..."
- **High Fragmentation**: "Let's slow down and ground ourselves..."

### Adaptive Polling Intervals
- **High Priority Guidance**: 3 seconds
- **Active Patterns**: 5 seconds
- **Default**: 15 seconds

## Testing & Debugging

### Manual Analysis Endpoint
`POST /api/vapi/analyze-transcript`
- Test pattern detection without live calls
- Validate orchestration logic with narrative metrics
- Debug methodology suggestions

### Console Logging
- Pattern detection: `🎯 Pattern detected`
- Narrative state: `📖 Narrative phase: deepening`
- Methodology switches: `🔄 Suggesting [Agent]`
- Narrative metrics: `📊 Fragmentation=4, Symbolic=3`
- Session events: `✅ Call started`, `📴 Call ended`
- Memory injection: `💉 Memory context injected`

## Configuration

### Environmental Variables
- `VAPI_SECRET_KEY`: VAPI platform authentication
- `VITE_VAPI_PUBLIC_KEY`: Frontend VAPI key
- `DATABASE_URL`: PostgreSQL connection
- `SUPABASE_URL`: Supabase service endpoint
- `SUPABASE_SERVICE_KEY`: Supabase authentication

### Agent Voice Models
All agents use OpenAI GPT-4 with customized parameters:
- **Sarah**: Temperature 0.95, speed 0.95 (warm, measured)
- **Mathew**: Temperature 0.9, speed 1.0 (clear, analytical)
- **Marcus**: Temperature 0.85, speed 0.9 (thoughtful, philosophical)
- **Zhanna**: Temperature 0.9, speed 0.85 (calm, grounding)

## Version History

### v5.0 (Current - Narrative Primacy)
- Narrative Primacy Module for all agents
- Enhanced pattern detection with narrative metrics
- Narrative-aware agent switching logic
- Journey phase tracking (building/deepening/integrating)
- Reduced cooldown to 30 seconds for responsiveness

### v4.0 (Four-Agent System)
- Added Zhanna for somatic/crisis support
- HSFB protocol integration
- Enhanced distress detection
- Priority-based switching hierarchy

### v3.0 (Natural Voice)
- Speak/meta tag separation
- Enhanced voice naturalness
- Crisis module integration

## Future Enhancements
- Visual pattern analytics dashboard
- Machine learning for narrative coherence prediction
- Personalized narrative phase thresholds
- Multi-modal pattern detection (voice tone, pace, silence patterns)
- Group therapy session orchestration
- Therapist supervision interface with narrative insights