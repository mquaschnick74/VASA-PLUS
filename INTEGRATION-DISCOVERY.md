# VASA Agent-Configs Integration Discovery

**Generated:** 2025-11-26
**Current File:** `client/src/config/agent-configs.ts`
**Proposed File:** VASA Implementation v2.0 (Remediated)

---

## 1. Dependency Map

### Files That Import from agent-configs.ts

| File | Imports | Usage |
|------|---------|-------|
| `client/src/hooks/use-vapi.ts:2` | `TherapeuticAgent` (interface) | Type annotation for `selectedAgent` prop |
| `client/src/components/voice-interface.tsx:10` | `getAgentById` | Looks up agent by ID when user selects one |
| `client/src/components/AgentSelector.tsx:2` | `THERAPEUTIC_AGENTS`, `TherapeuticAgent` | Renders agent selection dropdown, types props |
| `client/src/components/AgentCarousel.tsx:2` | `THERAPEUTIC_AGENTS` | Renders agent cards in carousel UI |

### Import Summary
```
agent-configs.ts
├── TherapeuticAgent (interface) ──► use-vapi.ts, AgentSelector.tsx
├── THERAPEUTIC_AGENTS (array) ──► AgentSelector.tsx, AgentCarousel.tsx
└── getAgentById (function) ──► voice-interface.tsx
```

---

## 2. firstMessageTemplate Call Sites

### Current Status: **NOT CALLED**

The `firstMessageTemplate` function is **defined but not used**:

```typescript
// use-vapi.ts:287
// CHANGE 2: REMOVED the firstMessageTemplate call - no more hardcoded greetings
```

### Where It's Defined (Current)
- `client/src/config/agent-configs.ts:452` - Sarah
- `client/src/config/agent-configs.ts:471` - Marcus
- `client/src/config/agent-configs.ts:490` - Mathew
- `client/src/config/agent-configs.ts:509` - Zhanna

### Current Signature
```typescript
firstMessageTemplate: (firstName: string, hasMemory: boolean) => string
```

### Proposed Signature
```typescript
firstMessageTemplate: (
  firstName: string,
  hasMemory: boolean,
  lastSessionSummary?: string | null
) => string
```

### Risk Assessment: **LOW**
- Since `firstMessageTemplate` is not currently called anywhere, the signature change is **non-breaking**
- However, if you plan to re-enable its use, you'd need to pass `lastSessionSummary` from `use-vapi.ts` where it's already available:
  - `use-vapi.ts:48` - `lastSessionSummary` is destructured from props
  - `voice-interface.tsx:124` - `lastSessionSummary: userContext?.lastSessionSummary || null` is passed

---

## 3. Meta Output Parsing

### Primary Parser Location
**File:** `server/utils/parseAssistantOutput.ts`

### Current Meta Interface (lines 4-31)
```typescript
export interface ParsedOutput {
  speak: string;
  meta: {
    register?: 'symbolic' | 'imaginary' | 'real' | 'mixed';
    css?: {
      stage: string;
      evidence: string[];
      confidence: number;  // ❌ REMOVED in proposed
    };
    detected_patterns?: { cvdc, ibm, thend, cyvc };
    themes?: string[];
    safety?: {
      flag: boolean;
      level: 'low' | 'moderate' | 'high' | 'crisis';
      indicators?: string[];
    };
    session?: {
      exchange_count: number;     // ❌ REMOVED in proposed
      narrative_depth: string;    // ❌ REMOVED in proposed
      rapport: string;
    };
  } | null;
}
```

### Fields Used in Production Code

| Field | Used In | Purpose |
|-------|---------|---------|
| `exchange_count` | `orchestration-service.ts:278-279` | Updates `session.exchangeCount` |
| `exchange_count` | `parseAssistantOutput.ts:126,136` | `getSessionProgress()`, `isReadyForCSSWork()` |
| `narrative_depth` | `parseAssistantOutput.ts:127,137` | `getSessionProgress()`, `isReadyForCSSWork()` |
| `css.confidence` | `orchestration-service.ts:292` | Stored in `css_patterns.confidence` |
| `css.confidence` | `parseAssistantOutput.ts:143` | `getCSSConfidence()` helper |
| `safety.flag` | `orchestration-service.ts:293` | Stored in `css_patterns.safety_flag` |
| `safety.crisis` | `orchestration-service.ts:294` | Stored in `css_patterns.crisis_flag` |
| `css.stage` | `orchestration-service.ts:283,291` | Stored in `css_patterns.css_stage` |
| `phase` | `orchestration-service.ts:272-274` | Updates `session.narrativePhase` |

### Helper Functions That Break If Fields Removed

| Function | File:Line | Fields Required |
|----------|-----------|-----------------|
| `getSessionProgress()` | `parseAssistantOutput.ts:120-130` | `exchange_count`, `narrative_depth`, `rapport` |
| `isReadyForCSSWork()` | `parseAssistantOutput.ts:133-139` | `exchange_count >= 15`, `narrative_depth === 'established'` |
| `getCSSConfidence()` | `parseAssistantOutput.ts:142-144` | `css.confidence` |

### Risk Assessment: **HIGH**
- **Breaking:** `isReadyForCSSWork()` checks `exchange_count >= 15` - this logic must be replaced with qualitative readiness
- **Breaking:** `orchestration-service.ts` stores `exchange_count` in session state
- **Breaking:** Database insert uses `css.confidence` for `css_patterns.confidence` column

---

## 4. Session Data Flow

### How lastSessionSummary Gets to the Agent

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                                │
│  └── session_summaries table                                            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  server/services/memory-service.ts:598,647-699                          │
│  └── Retrieves summary, returns { lastSessionSummary: string | null }   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  server/routes/auth-routes.ts:510-575                                   │
│  └── Includes lastSessionSummary in userContext response                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  client/src/components/voice-interface.tsx:124                          │
│  └── lastSessionSummary: userContext?.lastSessionSummary || null        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  client/src/hooks/use-vapi.ts:48,263-280                                │
│  └── Injects into systemPrompt as:                                      │
│      "===== PREVIOUS SESSION HISTORY =====" + lastSessionSummary        │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  VAPI/GPT-4o                                                            │
│  └── Agent receives full systemPrompt with session history              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Code References

**memory-service.ts:688** - Returns lastSessionSummary:
```typescript
return {
  lastSessionSummary: processedSummary,
  // ...
};
```

**use-vapi.ts:263-274** - Injects into prompt:
```typescript
if (shouldReferenceLastSession && lastSessionSummary) {
  systemPrompt += `\n\n===== LAST SESSION CONTEXT =====
${lastSessionSummary}
===== END LAST SESSION CONTEXT =====\n`;
  // ...
  systemPrompt += `\n\n===== PREVIOUS SESSION HISTORY =====
${memoryContext}
===== END PREVIOUS SESSION HISTORY =====\n`;
}
```

### Proposed Change Impact
The proposed version's `SESSION_CONTINUITY` section changes the "absent memory" messaging but doesn't change the data flow. The infrastructure already supports `lastSessionSummary` being passed to `firstMessageTemplate` if it were to be re-enabled.

---

## 5. Safety System Status

### Database Schema (shared/schema.ts:231-232)
```typescript
safety_flag: boolean("safety_flag").default(false),
crisis_flag: boolean("crisis_flag").default(false),
```

### Current Safety Implementation

| Component | Location | Function |
|-----------|----------|----------|
| **Meta field** | `agent-configs.ts:360-363` | `"safety": { "flag": boolean, "crisis": boolean }` |
| **Parser interface** | `parseAssistantOutput.ts:20-24` | Expects `safety.flag`, `safety.level` |
| **Detection helper** | `parseAssistantOutput.ts:85-91` | `needsSafetyIntervention()` - checks flag/level |
| **DB storage** | `orchestration-service.ts:293-294` | Inserts into `css_patterns` |
| **Intervention check** | `orchestration-service.ts:299-305` | Logs but has TODO for actual workflow |

### needsSafetyIntervention() Logic (parseAssistantOutput.ts:85-91)
```typescript
export function needsSafetyIntervention(meta: ParsedOutput['meta']): boolean {
  if (!meta?.safety) return false;
  return meta.safety.flag === true ||
         meta.safety.level === 'high' ||
         meta.safety.level === 'crisis';
}
```

### Current vs Proposed Safety

| Aspect | Current | Proposed |
|--------|---------|----------|
| Crisis Protocol | Not present | Full `CRISIS_PROTOCOL` section (~50 lines) |
| Detection criteria | Generic flag/level | Specific indicators (suicidal ideation, dissociation, etc.) |
| Modified HSFB | None | Crisis-specific ordering (Breathing first) |
| Resource provision | None | 988 Lifeline, Crisis Text Line references |
| Session end criteria | None | When to suggest ending session |

### Risk Assessment: **LOW** (additive)
- The proposed CRISIS_PROTOCOL is **additive** - it enhances agent behavior but doesn't break existing safety field parsing
- `safety.flag` and `safety.crisis` fields remain compatible
- `needsSafetyIntervention()` will continue to work

---

## 6. Risk Assessment Summary

### Breaking Changes (HIGH RISK)

| Change | Files Affected | Required Fix |
|--------|---------------|--------------|
| Remove `exchange_count` | `parseAssistantOutput.ts:126,136`, `orchestration-service.ts:278-279` | Update `isReadyForCSSWork()` to use qualitative readiness; remove exchange count tracking |
| Remove `narrative_depth` | `parseAssistantOutput.ts:127,137` | Update `getSessionProgress()` return type and consumers |
| Remove `css.confidence` | `parseAssistantOutput.ts:143`, `orchestration-service.ts:292` | Either keep field or update DB insert to default |
| New meta structure | `parseAssistantOutput.ts:4-31` | Update `ParsedOutput` interface to match new schema |

### Non-Breaking Changes (LOW RISK)

| Change | Reason |
|--------|--------|
| `firstMessageTemplate` signature | Function is not called anywhere |
| Agent personality blocks | Additive to systemPrompt |
| CRISIS_PROTOCOL | Additive protocol guidance |
| TRAUMA_COMPLEXITY | Additive protocol guidance |
| HSFB_PROCESS | Replaces inline content, same purpose |
| Differentiated first messages | Would only matter if `firstMessageTemplate` is re-enabled |

### Migration Checklist

If you proceed with the proposed changes:

- [ ] **Update `parseAssistantOutput.ts`:**
  - [ ] Add `dominant_modality` to interface
  - [ ] Add `readiness` object with 5 boolean fields
  - [ ] Update `isReadyForCSSWork()` to check `readiness` booleans instead of `exchange_count >= 15`
  - [ ] Decide: keep `css.confidence` or remove and update DB insert
  - [ ] Update `getSessionProgress()` or mark deprecated

- [ ] **Update `orchestration-service.ts`:**
  - [ ] Remove or modify `session.exchangeCount` tracking (line 279)
  - [ ] Update `css_patterns` insert if `confidence` field changes

- [ ] **Update database schema (if needed):**
  - [ ] `css_patterns.confidence` - decide if column stays

- [ ] **Test safety flow:**
  - [ ] Verify `needsSafetyIntervention()` still triggers correctly
  - [ ] Verify `css_patterns.safety_flag` and `crisis_flag` still populated

- [ ] **Optional - Re-enable firstMessageTemplate:**
  - [ ] Pass `lastSessionSummary` as third argument in `use-vapi.ts`
  - [ ] Update all agent templates to use new signature

---

## 7. Files to Modify (Ordered by Dependency)

1. **`client/src/config/agent-configs.ts`** - Apply new config
2. **`server/utils/parseAssistantOutput.ts`** - Update interface and helpers
3. **`server/services/orchestration-service.ts`** - Update meta field access
4. *(Optional)* `client/src/hooks/use-vapi.ts` - If re-enabling firstMessageTemplate

---

## Appendix: Full File References

### agent-configs.ts Import Graph
```
agent-configs.ts
│
├──► use-vapi.ts (TherapeuticAgent type)
│    └──► voice-interface.tsx (useVapi hook)
│
├──► voice-interface.tsx (getAgentById)
│
├──► AgentSelector.tsx (THERAPEUTIC_AGENTS, TherapeuticAgent)
│
└──► AgentCarousel.tsx (THERAPEUTIC_AGENTS)
```

### Meta Output Flow
```
GPT-4o Response with <meta>...</meta>
│
├──► parseAssistantOutput() ──► ParsedOutput.meta
│
├──► orchestration-service.ts
│    ├──► Updates session state (exchangeCount, narrativePhase)
│    ├──► Inserts to css_patterns table
│    └──► Checks needsSafetyIntervention()
│
└──► Helper functions
     ├──► extractCSSStage()
     ├──► extractRegister()
     ├──► extractPatterns()
     ├──► getSessionProgress()
     ├──► isReadyForCSSWork()
     ├──► getCSSConfidence()
     └──► getSafetyLevel()
```
