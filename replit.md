# VASA - Therapeutic Voice Assistant MVP

## Overview
AI-powered therapeutic voice assistant with real-time CSS (Conversational State Sensing) pattern detection, multi-agent support, and persistent memory across sessions. Features glassmorphic UI with purple theming and mobile-responsive design.

## File Structure

```
vasa-mvp/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui components
│   │   │   ├── voice-interface.tsx    # Main voice UI with call controls
│   │   │   ├── AgentSelector.tsx      # Multi-agent selection UI
│   │   │   ├── authentication.tsx     # Email auth component
│   │   │   ├── DeleteAccount.tsx      # Account deletion UI
│   │   │   └── AIDisclosureCard.tsx   # AI limitations dropdown
│   │   ├── config/
│   │   │   └── agent-configs.ts       # Sarah/Mathew agent definitions v3
│   │   ├── hooks/
│   │   │   └── use-vapi.ts           # VAPI WebSocket management
│   │   ├── pages/
│   │   │   └── dashboard.tsx         # Main dashboard page
│   │   ├── lib/
│   │   │   ├── queryClient.ts        # TanStack Query setup
│   │   │   └── utils.ts              # Utility functions
│   │   ├── App.tsx                   # Root app component
│   │   └── index.css                  # Tailwind + glassmorphic styles
│   └── index.html                     # Entry HTML
│
├── server/
│   ├── routes/
│   │   ├── auth-routes.ts            # Authentication endpoints
│   │   ├── vapi-routes.ts            # VAPI configuration endpoints
│   │   └── webhook-routes.ts         # VAPI webhook handler
│   ├── services/
│   │   ├── orchestration-service.ts  # Session & transcript management
│   │   ├── css-pattern-service.ts    # CSS stage detection (CVDC/IBM/Thend/CYVC)
│   │   ├── memory-service.ts         # Context building & persistence
│   │   ├── supabase-service.ts       # Database client
│   │   └── auth-service.ts           # User authentication
│   ├── utils/
│   │   └── parseAssistantOutput.ts   # Speak/meta tag parser
│   ├── storage.ts                     # Storage interfaces
│   ├── index.ts                       # Express server entry
│   └── vite.ts                        # Vite dev server integration
│
├── shared/
│   └── schema.ts                      # Drizzle ORM schemas
│
├── drizzle/
│   └── migrations/                    # Database migrations
│
└── attached_assets/                   # User-uploaded assets
```

## Key Features

### CSS Pattern Detection
- **CVDC**: Contradiction detection between opposing desires
- **IBM**: Intention-behavior mismatch patterns  
- **Thend**: Therapeutic shift moments
- **CYVC**: Choice/flexibility emergence
- **Register Tracking**: Symbolic/Imaginary/Real dominance

### Agent System v3
- **Natural Voice**: Separated `<speak>` and `<meta>` tags
- **Sarah**: Warm emotional support, feeling-first approach
- **Mathew**: Analytical pattern recognition, intention-action gaps
- **Crisis Module**: Grounding techniques for acute distress
- **HSFB Process**: Hearing/Seeing/Feeling/Breathing (sparse use)

### Session Management
- **Two-tier cache**: ActiveSessions Map + CheckedSessions Set
- **Race protection**: Promise-based initialization locks
- **Auto-cleanup**: 30-minute stale session removal
- **Duplicate prevention**: Transcript hash tracking

### Database Schema
```sql
therapeutic_sessions    # Voice session metadata
therapeutic_context     # Persistent memory/insights
session_transcripts     # Full conversation history (end-of-call only)
css_patterns           # Detected therapeutic patterns
users                  # User profiles
```

## Architecture

### Frontend
- **React 18** + TypeScript + Vite
- **shadcn/ui** + Radix UI primitives
- **Tailwind CSS** with glassmorphic design
- **TanStack Query** for data fetching
- **wouter** for routing

### Backend  
- **Express.js** + TypeScript
- **PostgreSQL** + Drizzle ORM
- **Supabase** for database services
- **VAPI** webhook integration

### Voice Integration
- **VAPI Platform** for voice processing
- **WebSocket** connection management
- **Real-time** transcript processing
- **Memory context** injection

## User Preferences
- Simple, everyday language communication
- Mobile-responsive design priority
- Privacy-focused data handling

## Recent Updates
- Natural voice configuration (v3) with speak/meta separation
- Mobile-responsive UI with dropdown positioning fixes
- AI disclosure card with crisis hotline info
- Efficient transcript storage (end-of-call only)
- CSS pattern detection with flexible regex patterns