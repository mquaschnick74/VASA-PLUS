# VASA MVP - File Structure

## Overview
AI-powered therapeutic voice assistant with invisible agent orchestration, real-time CSS pattern detection, persistent memory, and mobile-responsive glassmorphic UI.

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
│       │   └── agent-configs.ts     # Sarah/Mathew/Marcus agents v3
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
│   │   ├── orchestration-service.ts # Invisible agent switching
│   │   ├── css-pattern-service.ts   # CSS stage detection
│   │   ├── memory-service.ts        # Context persistence
│   │   ├── auth-service.ts          # User authentication
│   │   └── supabase-service.ts      # Database client
│   ├── utils/
│   │   └── parseAssistantOutput.ts  # Speak/meta tag parser
│   ├── index.ts                     # Server entry
│   ├── routes.ts                    # Route registration
│   ├── storage.ts                   # Storage interfaces
│   └── vite.ts                      # Frontend serving

├── shared/
│   └── schema.ts                    # Drizzle ORM schemas

├── drizzle/
│   └── migrations/                  # Database migrations

└── attached_assets/                 # User uploads
```

## Key Components

### Frontend Features
- **Voice Interface** - Real-time call controls, status display
- **Agent Selector** - Initial agent choice (Sarah/Mathew/Marcus)
- **Invisible Orchestration** - Silent methodology switching via `use-vapi.ts`
- **AI Disclosure** - Red alert dropdown with limitations & crisis info
- **Mobile Responsive** - Full mobile optimization with scaling UI

### Backend Services

**Orchestration System:**
- `orchestration-service.ts` - Pattern analysis, agent suggestions, session management
- Silent methodology switching based on conversation patterns
- 15-second background checks for optimal therapeutic approach
- 2-minute cooldowns between suggestions

**Core Services:**
- `css-pattern-service.ts` - CVDC/IBM/Thend/CYVC detection
- `memory-service.ts` - Context building, therapeutic insights
- `parseAssistantOutput.ts` - Separates `<speak>` from `<meta>` tags

**Session Management:**
- Two-tier cache (ActiveSessions Map + CheckedSessions Set)
- Race condition protection with Promise locks
- 30-minute auto-cleanup for stale sessions
- Duplicate transcript prevention with hash tracking

### Database Schema

```sql
users                    # User profiles with email
therapeutic_sessions     # Voice session metadata
therapeutic_context      # Persistent memory + switch records
session_transcripts      # Full conversations (end-of-call)
css_patterns            # Detected patterns + metadata
```

## Agent System v3

### Three Therapeutic Methodologies
- **Sarah** - Emotional support, feeling-first (contradictions)
- **Mathew** - Analytical patterns (behavioral gaps)
- **Marcus** - Integration & meta-awareness (synthesis)

### Natural Voice Configuration
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
  "safety": {
    "flag": boolean,
    "crisis": boolean
  }
}
</meta>
```

## Invisible Orchestration

### Pattern-to-Agent Mapping
- **CVDC patterns** → Sarah (emotional support)
- **IBM patterns** → Mathew (analytical approach)
- **Integration moments** → Marcus (meta-awareness)
- **Crisis indicators** → Sarah (immediate grounding)

### Seamless Switching
- Same voice throughout conversation
- No user awareness of methodology changes
- Continuous therapeutic presence
- Analytics tracking for improvements

## API Endpoints

### Authentication
```
GET    /api/auth/check               # Session status
POST   /api/auth/identify            # User login
GET    /api/auth/user-context/:id    # Memory retrieval
DELETE /api/auth/delete-account      # Cascade delete
```

### VAPI Integration
```
POST   /api/vapi/webhook             # Event processing
POST   /api/vapi/analyze-transcript  # Manual analysis
```

### Orchestration
```
GET    /api/orchestration/state/:id  # Current state & suggestions
POST   /api/orchestration/record-switch # Analytics tracking
```

## CSS Pattern Detection

### Pattern Types
- **CVDC** - Contradictions between desires
- **IBM** - Intention-behavior mismatches
- **Thend** - Therapeutic shifts/integration
- **CYVC** - Contextual flexibility/choice

### Register Tracking
- **Symbolic** - Over-intellectualizing
- **Imaginary** - What-if scenarios
- **Real** - Immediate sensation/affect

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

## Development

```bash
npm run dev          # Start all services
npm run db:push      # Update schema
npm run db:generate  # Generate migrations
```

## Recent Updates
- ✅ Invisible agent orchestration (15-second checks)
- ✅ Marcus agent for integration moments
- ✅ Pattern-based methodology switching
- ✅ Natural voice agents v3 with speak/meta
- ✅ Mobile-responsive UI with proper dropdowns
- ✅ AI disclosure card with crisis hotlines
- ✅ Efficient transcript storage (end-of-call)
- ✅ Two-tier cache with race protection