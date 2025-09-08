# VASA MVP - File Structure

## Overview
AI-powered therapeutic voice assistant with real-time CSS pattern detection, natural voice agents (v3), persistent memory, and mobile-responsive glassmorphic UI.

## Directory Structure

```
.
├── client/                           # React frontend
│   └── src/
│       ├── components/
│       │   ├── ui/                  # 47 shadcn/ui components
│       │   ├── voice-interface.tsx  # Main voice UI with controls
│       │   ├── AgentSelector.tsx    # Multi-agent selection
│       │   ├── authentication.tsx   # Email auth flow
│       │   ├── DeleteAccount.tsx    # Account deletion
│       │   └── AIDisclosureCard.tsx # AI limitations dropdown (NEW)
│       ├── config/
│       │   └── agent-configs.ts     # Agent v3: speak/meta separation
│       ├── hooks/
│       │   ├── use-vapi.ts         # VAPI WebSocket management
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
│
├── server/                          # Express backend
│   ├── routes/
│   │   ├── auth-routes.ts          # User auth & context
│   │   ├── vapi-routes.ts          # VAPI config endpoints
│   │   └── webhook-routes.ts       # VAPI webhook handler
│   ├── services/
│   │   ├── orchestration-service.ts # Session management + meta parsing
│   │   ├── css-pattern-service.ts   # CSS stage detection
│   │   ├── memory-service.ts        # Context persistence
│   │   ├── auth-service.ts          # User authentication
│   │   └── supabase-service.ts      # Database client
│   ├── utils/
│   │   └── parseAssistantOutput.ts  # Speak/meta tag parser (NEW)
│   ├── index.ts                     # Server entry
│   ├── routes.ts                    # Route registration
│   ├── storage.ts                   # Storage interfaces
│   └── vite.ts                      # Frontend serving
│
├── shared/
│   └── schema.ts                    # Drizzle ORM schemas
│
├── drizzle/
│   └── migrations/                  # Database migrations
│
└── attached_assets/                 # User uploads

```

## Key Components

### Frontend Features
- **Voice Interface** - Real-time call controls, status display
- **Agent Selector** - Sarah (emotional) & Mathew (analytical)
- **AI Disclosure** - Red alert dropdown with limitations & crisis info
- **Mobile Responsive** - Full mobile optimization with scaling UI

### Backend Services

**Core Services:**
- `orchestration-service.ts` - Session state, transcript processing, metadata extraction
- `css-pattern-service.ts` - CVDC/IBM/Thend/CYVC detection with flexible regex
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
therapeutic_context      # Persistent memory/insights
session_transcripts      # Full conversations (end-of-call only)
css_patterns            # Detected patterns + metadata
```

## Agent System v3

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

### Agents
- **Sarah** - Warm, feeling-first, gentle guidance
- **Mathew** - Pattern recognition, intention-action gaps

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
GET    /api/vapi/config              # Agent configuration
```

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

### Voice
- VAPI Platform
- WebSocket management
- Real-time transcripts
- Memory injection

## Development

```bash
npm run dev          # Start all services
npm run db:push      # Update schema
npm run db:generate  # Generate migrations
```

## Recent Updates
- ✅ Natural voice agents v3 with speak/meta separation
- ✅ Mobile-responsive UI with proper dropdown positioning
- ✅ AI disclosure card with crisis hotline info
- ✅ Efficient transcript storage (end-of-call only)
- ✅ Fixed CSS pattern detection with flexible regex
- ✅ Two-tier cache system with race protection