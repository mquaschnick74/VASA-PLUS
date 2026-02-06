# HSFB Protocol Audit — Programmatic Utilization Across the Architecture

## Summary

HSFB (Hearing, Seeing, Feeling, Breathing) is utilized across **5 layers** of the architecture:

1. **Knowledge base document** — ingested into RAG for retrieval during Claude-powered responses
2. **Silence monitor** — detection logic + extended thresholds + grounding templates
3. **Distress detection service** — trigger conditions + category-specific intervention generation
4. **Database schema** — `hsfb_invoked` boolean in `css_patterns` table for tracking
5. **RAG ingestion pipeline** — tagged `['hsfb', 'grounding', 'real', 'body']`

**Key finding:** HSFB is NOT explicitly embedded in agent system prompts. It surfaces through two runtime mechanisms: (1) RAG retrieval when conversational context matches HSFB-tagged knowledge, and (2) programmatic triggering via distress detection or silence monitoring.

---

## File-by-File Breakdown

### 1. `server/services/sensing-layer/silence-monitor.ts`

| Location | What |
|----------|------|
| Lines 60-66 | HSFB-specific re-engagement templates (`"Stay with it."`, `"Where is it now?"`, `"What do you notice?"`, `"Keep breathing."`, `"What shifted?"`) |
| Lines 122-141 | `isInHSFBWork()` — detects HSFB state via PRIMARY (Real register + deepening > 0.3) and SECONDARY (somatic/visualization language + deepening > 0.2) |
| Lines 147-148 | Silence threshold set to 42,000ms when HSFB detected (vs 18-35s for other states) |
| Line 192 | `selectTemplateMessage()` routes to HSFB templates when `isInHSFBWork()` returns true |

**Role:** Context-aware silence handling. When a user is in somatic/embodied work, the system gives them significantly more time before interrupting and uses minimal, grounding-focused language.

---

### 2. `server/services/distress-detection-service.ts`

| Location | What |
|----------|------|
| Lines 1-2 | File header: "Distress Detection Service for HSFB Integration" |
| Lines 326-361 | `shouldTriggerHSFB()` — trigger conditions: distress >= 7 (immediate), escalating patterns, sustained moderate distress (3+ exchanges at 5+), category-specific (dissociation at 5+, panic at 6+) |
| Lines 366-395 | `generateHSFBPrompt()` — category-specific interventions: panic (4-2-6 breathing), dissociation (5-4-3-2-1 grounding), fragmentation (breath + auditory), overwhelm (visualization/distance), somatic (body scan) |
| Lines 400-411 | `HSFBIntervention` interface — tracks userId, callId, triggerType, pre/post assessment, interventionPrompt, modalityFocus, effectiveness |
| Lines 416-427 | `calculateInterventionEffectiveness()` — measures post-intervention distress reduction |

**Role:** Bridges distress detection and HSFB application. When users show emotional dysregulation, it generates and triggers appropriate grounding interventions.

---

### 3. `knowledge/hsfb-protocol.txt` (229 lines)

Full HSFB theoretical and practical framework:
- Tripartite+1 structure (Hearing, Seeing, Feeling, Breathing)
- Perceptual sensory reference point (dominant modality: auditory, visual, kinesthetic)
- HSFB mapped through all 5 CSS stages with specific interventions
- Breathing as diagnostic indicator and foundation
- Two clinical case examples
- Implementation components for VASA

**Role:** Source document for RAG retrieval. Available to Claude during Tier 1 (Claude+RAG) re-engagement and during regular sensing layer guidance generation.

---

### 4. `server/scripts/ingest-knowledge.ts` (Lines 88-92)

```typescript
{
  filePath: './knowledge/hsfb-protocol.txt',
  type: 'technique',
  tags: ['hsfb', 'grounding', 'real', 'body'],
  description: 'HSFB protocol for register grounding'
}
```

**Role:** Configures the HSFB document for knowledge base ingestion with semantic tags that enable retrieval when Real register or grounding-related queries arise.

---

### 5. Database Schema (`VASA-MVP-memory-architecture.md`, line 51)

```sql
hsfb_invoked BOOLEAN  -- in css_patterns table
```

**Role:** Persistent tracking of whether HSFB was invoked during a session, enabling cross-session memory and pattern analysis.

---

## Architecture Gap

HSFB is available through RAG retrieval and triggered by runtime detection, but it is **not explicitly present in agent system prompts**. This means:

- The agent doesn't "know about" HSFB unless RAG surfaces it or distress detection triggers it
- HSFB language may appear organically in agent responses when RAG chunks match conversational context
- There is no guaranteed invocation path for HSFB outside of high-distress situations and silence during Real register work
