# VASA - File Structure

## Overview
Therapeutic voice assistant with React frontend, Express backend, PostgreSQL database. Features multi-agent support, persistent memory, CSS pattern detection, and real-time voice interactions.

## Directory Structure

```
.
├── client/                   # React frontend application
│   └── src/
│       ├── components/       # React components
│       │   ├── ui/          # 47 shadcn/ui components
│       │   ├── AgentSelector.tsx
│       │   ├── authentication.tsx
│       │   ├── DeleteAccount.tsx
│       │   └── voice-interface.tsx
│       ├── config/
│       │   └── agent-configs.ts
│       ├── hooks/
│       │   ├── use-mobile.tsx
│       │   ├── use-toast.ts
│       │   └── use-vapi.ts
│       ├── lib/
│       │   ├── queryClient.ts
│       │   └── utils.ts
│       ├── pages/
│       │   ├── dashboard.tsx
│       │   └── not-found.tsx
│       ├── App.tsx
│       ├── index.css
│       └── main.tsx
│
├── server/                   # Express backend server
│   ├── routes/
│   │   ├── auth-routes.ts   # User auth & cascade delete
│   │   └── webhook-routes.ts # VAPI webhooks & CSS detection
│   ├── services/
│   │   ├── css-pattern-service.ts      # CSS pattern detection
│   │   ├── distress-detection-service.ts # Crisis intervention
│   │   ├── memory-service.ts           # Therapeutic memory
│   │   ├── orchestration-service.ts    # Service coordination
│   │   ├── supabase-service.ts        # Database interface
│   │   └── user-service.ts            # User management
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # Route registration
│   ├── storage.ts           # Storage interface
│   └── vite.ts             # Frontend serving
│
├── shared/
│   └── schema.ts            # Database schema (Drizzle ORM)
│
├── attached_assets/         # User uploads & documentation
├── *.config.*              # Configuration files
├── package.json            # Dependencies & scripts
└── test-*.js              # Test scripts
```

## Key Components

### Frontend (`/client/src`)

**Core Components:**
- `voice-interface.tsx` - Voice session UI with real-time status
- `AgentSelector.tsx` - Multi-agent selection (Sarah, Mathew)
- `authentication.tsx` - Email-based user identification
- `DeleteAccount.tsx` - Account deletion with confirmation

**Hooks:**
- `use-vapi.ts` - Voice AI integration & session management
- `use-toast.ts` - Notification system
- `use-mobile.tsx` - Responsive detection

**Configuration:**
- `agent-configs.ts` - Therapeutic agent prompts & behaviors

### Backend (`/server`)

**Routes:**
- `/api/auth/*` - User authentication, context, deletion
- `/api/vapi/*` - Voice webhooks, pattern analysis

**Services:**
- `css-pattern-service.ts` - CVDC/IBM/Thend/CYVC pattern detection
- `memory-service.ts` - Context building & retrieval
- `distress-detection-service.ts` - Crisis grounding protocols
- `orchestration-service.ts` - Service coordination layer
- `user-service.ts` - Cascade delete & user management

### Database Schema (`/shared/schema.ts`)

**Tables:**
- `users` - User profiles
- `therapeutic_sessions` - Voice sessions
- `therapeutic_context` - Persistent memory
- `session_transcripts` - Conversation history
- `css_patterns` - Detected patterns
- `css_progressions` - Stage transitions

## CSS Pattern Detection System

**Pattern Types:**
- **CVDC** - Contradictions ("I want X but Y")
- **IBM** - Behavioral gaps ("I keep doing X even though")
- **Thend** - Integration moments ("I realize both")
- **CYVC** - Contextual choice ("Sometimes I X, other times Y")

**Stages:**
1. `pointed_origin` - Initial state
2. `focus_bind` - Pattern identified
3. `suspension` - Multiple patterns held
4. `gesture_toward` - Integration attempts
5. `completion` - Contextual variation
6. `terminal` - Full integration

## API Endpoints

### Authentication
- `GET /api/auth/check` - Session status
- `POST /api/auth/identify` - User login
- `GET /api/auth/user-context/:id` - User memory
- `DELETE /api/auth/delete-account` - Cascade delete

### VAPI Integration
- `POST /api/vapi/webhook` - Voice event processing
- `POST /api/vapi/analyze-transcript` - Manual CSS analysis

## Key Features

**Frontend:**
- Real-time voice conversations
- Multi-agent support
- Glassmorphic purple UI
- Session persistence
- Responsive design

**Backend:**
- CSS pattern detection
- Memory context building
- Stage progression tracking
- Cascade delete safety
- Webhook processing

**Database:**
- User management
- Session tracking
- Pattern storage
- Context persistence
- Progression history

## Development

```bash
npm run dev          # Start frontend & backend
npm run db:push      # Update database schema
npm run db:generate  # Generate migrations
```

## Configuration Files

- `vite.config.ts` - Build configuration
- `tailwind.config.ts` - Styling theme
- `drizzle.config.ts` - Database ORM
- `components.json` - shadcn/ui setup
- `tsconfig.json` - TypeScript config
- `replit.md` - Project documentation