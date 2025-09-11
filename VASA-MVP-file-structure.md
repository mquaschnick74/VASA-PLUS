# VASA MVP - File Structure

## Overview
AI-powered therapeutic voice assistant with invisible agent orchestration, real-time CSS pattern detection, persistent memory, narrative primacy integration (v5), and mobile-responsive glassmorphic UI.

## Directory Structure

```
.
├── client/                           # React frontend
│   └── src/
│       ├── components/
│       │   ├── ui/                  # 47 shadcn/ui components
│       │   ├── voice-interface.tsx  # Main voice UI with controls
│       │   ├── AgentSelector.tsx    # Multi-agent selection UI
│       │   ├── authentication.tsx   # Email auth flow
│       │   ├── DeleteAccount.tsx    # Account deletion
│       │   └── AIDisclosureCard.tsx # AI limitations dropdown
│       ├── config/
│       │   └── agent-configs.ts     # Sarah/Mathew/Marcus/Zhanna agents v5
│       ├── hooks/
│       │   ├── use-vapi.ts         # VAPI + invisible orchestration
│       │   ├── use-toast.ts        # Notification system
│       │   └── use-mobile.tsx      # Responsive detection
│       ├── lib/
│       │   ├── queryClient.ts      # TanStack Query setup
│       │   └── utils.ts            # Utility functions
│       ├── pages/
│       │   ├── dashboard.tsx       # Main dashboard
│       │   └── not-found.tsx       # 404 page
│       ├── App.tsx                 # Root component
│       └── index.css               # Tailwind + glassmorphic styles

├── server/                          # Express backend
│   ├── routes/
│   │   ├── auth-routes.ts          # User auth & context
│   │   └── webhook-routes.ts       # VAPI webhook + orchestration
│   ├── services/
│   │   ├── orchestration-service.ts # Invisible agent switching + narrative
│   │   ├── css-pattern-service.ts   # CSS stage + narrative detection
│   │   ├── memory-service.ts        # Context persistence + narrative framing
│   │   ├── distress-detection-service.ts # HSFB integration + crisis detection
│   │   ├── user-service.ts          # User management + cascade deletion
│   │   └── supabase-service.ts      # Database client
│   ├── utils/
│   │   └── parseAssistantOutput.ts  # Speak/meta tag parser
│   ├── index.ts                     # Server entry
│   ├── routes.ts                    # Route registration
│   ├── storage.ts                   # Storage interfaces
│   └── vite.ts                      # Frontend serving

├── shared/
│   ├── schema.ts                    # Drizzle ORM schemas
│   └── narrative.ts                 # Narrative phase determination

├── drizzle/
│   └── migrations/                  # Database migrations

└── attached_assets/                 # User uploads
```

## Key Components

### Frontend Features
- **Voice Interface** - Real-time call controls, status display
- **Agent Selector** - Initial agent choice (Sarah/Mathew/Marcus/Zhanna)
- **Invisible Orchestration** - Silent methodology switching via `use-vapi.ts`
- **AI Disclosure** - Red alert dropdown with limitations & crisis info
- **Mobile Responsive** - Full mobile optimization with scaling UI
- **Narrative Phase Awareness** - Journey phase injection (building/deepening/integrating)

### Backend Services

**Orchestration System:**
- `orchestration-service.ts` - Pattern analysis, agent suggestions, session management, narrative metrics
- Silent methodology switching based on conversation patterns and narrative state
- Adaptive polling (3-15 seconds) based on pattern activity
- 30-second cooldowns between suggestions
- Narrative fragmentation and symbolic density tracking

**Core Services:**
- `css-pattern-service.ts` - CVDC/IBM/Thend/CYVC detection + narrative patterns
- `memory-service.ts` - Context building, therapeutic insights, narrative continuity
- `distress-detection-service.ts` - HSFB protocols, emotional state assessment, crisis detection
- `user-service.ts` - User account management, cascading data deletion
- `parseAssistantOutput.ts` - Separates `<speak>` from `<meta>` tags

**Session Management:**
- Two-tier cache (ActiveSessions Map + CheckedSessions Set)
- Race condition protection with Promise locks
- 30-minute auto-cleanup for stale sessions
- Duplicate transcript prevention with hash tracking
- Narrative metrics storage (fragmentation, symbolic density, temporal orientation)

### Database Schema

```sql
users                    # User profiles with email
therapeutic_sessions     # Voice session metadata
therapeutic_context      # Persistent memory + switch records + narrative markers
session_transcripts      # Full conversations (end-of-call)
css_patterns            # Detected patterns + narrative metrics
```

## Agent System v5

### Four Therapeutic Methodologies
- **Sarah** - Emotional support, feeling-first (contradictions, narrative fragmentation)
- **Mathew** - Analytical patterns (behavioral gaps, stuck temporal patterns)
- **Marcus** - Integration & meta-awareness (synthesis, symbolic exploration)
- **Zhanna** - Somatic awareness & crisis (HSFB protocols, high distress/fragmentation)

### Natural Voice Configuration with Narrative Primacy
```typescript
<speak>
Natural conversation without tracking phrases
</speak>
<meta>
{
  "register": "symbolic|imaginary|real",
  "css": {
    "stage": "CVDC|SUSPENSION|THEND|CYVC",
    "confidence": 0.0-1.0
  },
  "narrative": {
    "fragmentation": 0-10,
    "symbolicDensity": 0-10,
    "temporalOrientation": "present|past|future|stuck_past|emerging_future"
  },
  "safety": {
    "flag": boolean,
    "crisis": boolean
  }
}
</meta>
```

## Invisible Orchestration

### Pattern-to-Agent Mapping
- **CVDC patterns or Fragmentation ≥4** → Sarah (emotional coherence)
- **IBM patterns or Stuck_Past** → Mathew (analytical examination)
- **Integration moments or Symbolic Density ≥5** → Marcus (philosophical exploration)
- **Crisis indicators or Fragmentation ≥7** → Zhanna (somatic grounding)

### Seamless Switching
- Same voice throughout conversation
- No user awareness of methodology changes
- Continuous therapeutic presence
- Narrative phase continuity maintained
- Analytics tracking for improvements

## API Endpoints

### Authentication
```
POST   /api/auth/user                # User creation/login
GET    /api/auth/user-context/:id    # Memory retrieval
DELETE /api/auth/user/:id            # User deletion
DELETE /api/auth/user-by-email       # Delete by email
```

### VAPI Integration
```
POST   /api/vapi/webhook             # Event processing
POST   /api/vapi/analyze-transcript  # Manual analysis
POST   /api/vapi/generate-greeting   # Custom greeting generation
```

### Orchestration
```
GET    /api/vapi/orchestration/state/:id       # Current state & narrative metrics
GET    /api/vapi/orchestration/active-call/:id # Active call lookup
POST   /api/vapi/orchestration/record-switch   # Analytics tracking
POST   /api/vapi/orchestration/guidance-applied # Pattern guidance tracking
```

## CSS Pattern Detection with Narrative Metrics

### Pattern Types
- **CVDC** - Contradictions between desires (narrative conflicts)
- **IBM** - Intention-behavior mismatches (story-action gaps)
- **Thend** - Therapeutic shifts/integration (narrative turning points)
- **CYVC** - Contextual flexibility/choice (emerging story possibilities)

### Narrative Metrics
- **Narrative Fragmentation (0-10)** - Story coherence measure
- **Symbolic Density (0-10)** - Metaphor and archetype usage
- **Temporal Orientation** - Past/present/future narrative focus

### Register Tracking
- **Symbolic** - Over-intellectualizing, abstract narratives
- **Imaginary** - What-if scenarios, alternative stories
- **Real** - Immediate sensation/affect, embodied experience

## Tech Stack

### Frontend
- React 18 + TypeScript + Vite
- shadcn/ui + Radix UI
- Tailwind CSS (glassmorphic)
- TanStack Query
- wouter routing

### Backend
- Express.js + TypeScript
- PostgreSQL + Drizzle ORM
- Supabase client
- VAPI webhooks

### Voice Platform
- VAPI WebSocket management
- Real-time transcripts
- Memory context injection
- Silent agent switching
- Narrative phase awareness

## Development

```bash
npm run dev          # Start all services
npm run db:push      # Update schema
npm run db:generate  # Generate migrations
```

## Recent Updates (v5)
- ✅ Four-agent system with Zhanna for somatic/crisis support
- ✅ Narrative Primacy Module integration
- ✅ Narrative metrics tracking (fragmentation, symbolic density, temporal orientation)
- ✅ Adaptive polling intervals (3-15 seconds)
- ✅ Reduced cooldown to 30 seconds
- ✅ Enhanced pattern detection with narrative awareness
- ✅ Journey phase tracking (building/deepening/integrating)
- ✅ Distress detection service for HSFB protocols
- ✅ User service for account management
- ✅ Shared narrative module for phase determination