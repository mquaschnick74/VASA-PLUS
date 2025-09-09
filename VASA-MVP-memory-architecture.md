# VASA Memory Architecture

## Overview
Multi-layered memory system with persistent therapeutic context, invisible agent orchestration, CSS pattern detection, and intelligent context building across voice sessions.

## Database Schema

### Core Tables

```sql
users                    # User profiles (id, email, first_name)
therapeutic_sessions     # Voice sessions (call_id, agent_name, status)
therapeutic_context      # Memory & insights (type, content, confidence)
css_patterns            # Pattern detection (stage, register, confidence)
session_transcripts     # Full conversations (end-of-call only)
```

### Key Fields

#### `therapeutic_context`
- **Types**: insight, pattern, summary, methodology_switch
- **Content**: Therapeutic observations, switch records (Sarah→Mathew)
- **Metadata**: CSS stages, patterns, orchestration data
- **Confidence**: 0.0-1.0 reliability score

#### `css_patterns`
- **Stage**: CVDC/IBM/THEND/CYVC/NONE
- **Register**: symbolic/imaginary/real
- **Safety**: crisis_flag, safety_flag, hsfb_invoked
- **Orchestration**: suggested_agent, switch_reason

## Memory Flow Architecture

### 1. Real-Time Processing
```
User Speech → VAPI Webhook → Pattern Detection → Memory Storage
     ↓              ↓                ↓              ↓
Agent Response → Parse Tags → Orchestration → Silent Switching
```

### 2. Invisible Orchestration Memory
```typescript
// Orchestration state tracked in memory
OrchestrationState {
  currentMethodology: 'sarah' | 'mathew' | 'marcus'
  suggestedAgent: string
  lastSwitchTime: Date
  switchHistory: Array<{from, to, reason, timestamp}>
  patterns: {cvdc: 0, ibm: 0, thend: 0, cyvc: 0}
}
```

### 3. Session Management
```typescript
activeSessions: Map<callId, SessionState>     // In-memory cache
checkedSessions: Set<callId>                  // DB lookup cache
initializationLocks: Map<callId, Promise>     // Race protection
```

## Agent System v3 with Orchestration

### Three Therapeutic Methodologies
- **Sarah** - Emotional support (CVDC patterns)
- **Mathew** - Analytical patterns (IBM gaps)
- **Marcus** - Integration & meta-awareness (Thend/synthesis)

### Memory-Aware Agent Switching
```typescript
// Silent methodology updates preserve context
systemPrompt += `
===== SESSION HISTORY =====
${memoryContext}
===== CURRENT FOCUS =====
Continue naturally without indicating any change.
Maintain therapeutic thread from previous responses.
===== END CONTEXT =====
`;
```

### Natural Voice Format
```typescript
<speak>
Natural therapeutic conversation
</speak>
<meta>
{
  "register": "symbolic|imaginary|real",
  "css": {
    "stage": "CVDC|SUSPENSION|THEND|CYVC",
    "confidence": 0.85
  },
  "orchestration": {
    "suggestAgent": "mathew",  // Backend suggestion
    "reason": "ibm_pattern_detected"
  }
}
</meta>
```

## Memory Building Process

### Context Generation (`buildTherapeuticContext`)

1. **Fetch Recent Data**
```sql
-- Last 5 sessions + CSS patterns + therapeutic insights
SELECT sessions, patterns, context 
WHERE user_id = $1 AND confidence > 0.5
ORDER BY created_at DESC
```

2. **Include Orchestration History**
```sql
-- Methodology switches for continuity
SELECT content FROM therapeutic_context
WHERE context_type = 'methodology_switch'
AND user_id = $1
ORDER BY created_at DESC LIMIT 3
```

3. **Generate Comprehensive Context**
```typescript
return `
Sessions: ${sessionCount} with ${firstName}
Current methodology: Continuing therapeutic approach

CSS Patterns:
- ${dominantPattern}: "${recentExample}"
- Register: ${registerDominance}
- Stage progression: ${stageHistory}

Key insights:
${insights.map(i => `- ${i.content}`)}

Recent focus: ${lastMethodologyFocus}
Safety: ${crisisHistory ? 'Previous crisis noted' : 'None'}
`;
```

## CSS Pattern System

### Pattern Detection → Agent Mapping
| Pattern | Agent | Trigger Threshold |
|---------|-------|-------------------|
| CVDC (contradictions) | Sarah | 3+ occurrences |
| IBM (gaps) | Mathew | 5+ occurrences |
| Thend (shifts) | Marcus | 2+ occurrences |
| Crisis indicators | Sarah | Immediate |

### Register Tracking
- **Symbolic** - Intellectualizing → Mathew
- **Imaginary** - Rumination → Sarah
- **Real** - Body/sensation → Marcus

## Integration Points

### 1. User Context Loading
```typescript
// Initial memory injection
fetch(`/api/auth/user-context/${userId}`)
  .then(context => {
    // Includes full history + orchestration state
    setMemoryContext(context);
  });
```

### 2. Invisible Orchestration Check
```typescript
// Background methodology optimization (every 15s)
fetch(`/api/orchestration/state/${callId}`)
  .then(state => {
    if (state.suggestedAgent && state.canSwitch) {
      silentlyUpdateMethodology(state.suggestedAgent);
    }
  });
```

### 3. Switch Recording
```typescript
// Track methodology changes for continuity
fetch('/api/orchestration/record-switch', {
  method: 'POST',
  body: { fromMethodology, toMethodology, reason }
});
```

## Optimization Strategies

### Efficient Storage
- **During call**: Pattern detection only
- **End-of-call**: Complete transcript stored once
- **Deduplication**: Hash-based duplicate prevention
- **Switch events**: Stored as context entries

### Cache Management
```typescript
// 30-minute cleanup for stale sessions
setInterval(cleanupStaleSessions, 30 * 60 * 1000);

// Promise-based race protection
async function ensureSession(callId) {
  if (initializationLocks.has(callId)) {
    return await initializationLocks.get(callId);
  }
  const promise = initializeSession(callId);
  initializationLocks.set(callId, promise);
  return await promise;
}
```

## Memory Context Examples

### First Session
```
Hello Frank. I'm curious what's most present for you today.
[No history - establishing baseline]
```

### Returning User with Patterns
```
Frank, good to connect again. What's shifted since we explored those tensions?
[Internal: CVDC patterns detected, Sarah methodology active]
```

### After Invisible Switch
```
[Continues naturally] That pattern you're describing - the gap between 
intention and action - tell me more about that.
[Internal: Switched to Mathew based on IBM patterns, user unaware]
```

### Integration Moment
```
[Seamless transition] Something seems to be coming together here. 
What are you noticing in this moment?
[Internal: Marcus activated for integration, maintaining flow]
```

## Privacy & Data Management

### Cascade Deletion
```sql
DELETE users → CASCADE removes:
  - therapeutic_sessions
  - therapeutic_context (including switches)
  - css_patterns
  - session_transcripts
```

### Data Retention
- Active sessions: 30-minute cache
- Database records: Persistent until deletion
- Orchestration history: Stored as context
- No external sharing

## Technical Implementation

### Key Files
- `server/services/memory-service.ts` - Context building
- `server/services/orchestration-service.ts` - Agent suggestions
- `client/src/hooks/use-vapi.ts` - Silent switching logic
- `server/routes/webhook-routes.ts` - Orchestration endpoints
- `server/services/css-pattern-service.ts` - Pattern detection

### Performance Metrics
- Context build: <100ms
- Pattern detection: Real-time
- Orchestration check: Every 15s
- Switch execution: <500ms
- Cache hit rate: ~95%

## Benefits

1. **Seamless Continuity** - Invisible methodology changes preserve therapeutic flow
2. **Adaptive Memory** - Context includes orchestration history
3. **Pattern-Driven** - Memory informs optimal agent selection
4. **Crisis Aware** - Safety flags influence methodology
5. **Progress Tracking** - CSS stages + methodology effectiveness
6. **Natural Experience** - Users unaware of backend orchestration