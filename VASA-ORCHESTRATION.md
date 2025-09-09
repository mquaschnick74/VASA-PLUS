# VASA MVP - Invisible Agent Orchestration

## Overview
VASA uses invisible orchestration to seamlessly switch between three therapeutic methodologies (Sarah, Mathew, Marcus) without user awareness. The system maintains one continuous conversation while adapting the therapeutic approach based on detected conversation patterns.

## Core Architecture

### Agent Methodologies
- **Sarah**: Emotional support, feeling-first approach (contradictions)
- **Mathew**: Analytical pattern recognition (behavioral gaps)  
- **Marcus**: Integration and meta-awareness (synthesis moments)

### Orchestration Flow
```
User speaks → Backend analyzes patterns → Suggests methodology → Client silently switches → Continues seamlessly
```

## Technical Implementation

### Client-Side (`use-vapi.ts`)
- **Silent Monitoring**: Checks `/api/orchestration/state/:callId` every 15 seconds
- **Invisible Switching**: Uses `vapi.setAssistant()` to update only system prompt
- **Continuity Instructions**: Adds prompt instructions to never indicate changes occurred
- **Analytics Tracking**: Records switches via `/api/orchestration/record-switch`

### Server-Side (`orchestration-service.ts`)
- **Pattern Detection**: Analyzes CSS patterns (CVDC/IBM/Thend/CYVC)
- **Smart Suggestions**: Maps patterns to appropriate methodologies
- **Cooldown Management**: 2-minute minimum between suggestions
- **Session Tracking**: Two-tier cache (ActiveSessions Map + CheckedSessions Set)

## Pattern-to-Agent Mapping

| Pattern Detected | Suggested Agent | Rationale |
|-----------------|-----------------|-----------|
| CVDC (Contradictions) | Sarah | Emotional support for conflicting desires |
| IBM (Intention-Behavior) | Mathew | Analytical approach for action gaps |
| Integration Moments | Marcus | Meta-awareness for synthesis |
| High Thend | Marcus | Integration of therapeutic shifts |
| Crisis Indicators | Sarah | Immediate emotional grounding |

## API Endpoints

### `GET /api/orchestration/state/:callId`
Returns current orchestration state:
```json
{
  "suggestedAgent": "mathew",
  "confidence": 0.85,
  "canSwitch": true,
  "lastSwitchTime": "2025-01-10T10:30:00Z",
  "patterns": {
    "cvdc": 2,
    "ibm": 5,
    "thend": 1
  }
}
```

### `POST /api/orchestration/record-switch`
Records methodology switches for analytics:
```json
{
  "callId": "abc123",
  "userId": "user456",
  "fromMethodology": "sarah",
  "toMethodology": "mathew",
  "reason": "pattern_detected"
}
```

## Key Features

### Seamless User Experience
- Same voice throughout conversation
- No interruptions or pauses during switches
- Natural conversation flow maintained
- User never knows agents are changing

### Safety Mechanisms
- 2-minute cooldowns prevent rapid switching
- Graceful error handling (failures don't break conversation)
- Pattern confidence thresholds (>0.7 required)
- Session cleanup after 30 minutes inactive

### System Prompts
Each methodology switch includes:
```
IMPORTANT: You are continuing an ongoing conversation. 
Do not reintroduce yourself or indicate any change has occurred.
Continue naturally from where the conversation is at this moment.
Maintain the same warm, consistent presence throughout.
Never mention switching approaches or changing methods.
```

## Monitoring & Analytics

### Session Management
- **ActiveSessions Map**: Real-time session tracking
- **CheckedSessions Set**: Deduplication protection
- **Promise-based locks**: Race condition prevention
- **Auto-cleanup**: 30-minute stale session removal

### Pattern Analytics
- CSS pattern counts per session
- Methodology switch frequency
- Pattern confidence scores
- User journey mapping

## Database Storage

### `therapeutic_context` Table
Stores methodology switches:
- `context_type`: 'methodology_switch'
- `content`: Switch details (from → to)
- `confidence`: 1.0 (explicit switches)
- `importance`: 7 (moderate priority)

### `css_patterns` Table
Tracks detected patterns:
- Pattern types and counts
- Detection timestamps
- Confidence scores
- Associated transcripts

## Testing & Debugging

### Manual Analysis Endpoint
`POST /api/vapi/analyze-transcript`
- Test pattern detection without live calls
- Validate orchestration logic
- Debug methodology suggestions

### Console Logging
- Pattern detection: `🎯 Stage identification`
- Methodology switches: `🔄 Silently switching`
- Session events: `✅ Call started`, `📴 Call ended`

## Future Enhancements
- Machine learning for pattern recognition
- Personalized switching thresholds
- Multi-modal pattern detection (voice tone, pace)
- Expanded agent pool for specialized scenarios