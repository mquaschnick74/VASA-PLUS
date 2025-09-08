# VASA - File Structure Documentation

## Project Overview
VASA is a therapeutic voice assistant application with a React frontend, Express backend, and PostgreSQL database integration. Features multi-agent support, persistent memory, user authentication, session analytics, and cascade delete functionality.

## Root Directory
```
├── attached_assets/          # User-uploaded assets and project documentation
├── client/                   # Frontend React application
├── server/                   # Backend Express server
├── shared/                   # Shared types and schemas
├── components.json           # shadcn/ui component configuration
├── drizzle.config.ts         # Database ORM configuration
├── file-structure.md         # Project file structure documentation
├── memory-architecture.md    # Memory system architecture documentation
├── package.json              # Node.js dependencies and scripts
├── postcss.config.js         # CSS processing configuration
├── replit.md                 # Project documentation and user preferences
├── tailwind.config.ts        # Tailwind CSS configuration
├── test-cascade-delete.js    # Test file for cascade delete functionality
├── tsconfig.json             # TypeScript configuration
└── vite.config.ts            # Vite build tool configuration
```

## Client Directory (`/client`)
Frontend React application with TypeScript and modern tooling.

### Source Structure (`/client/src`)
```
src/
├── components/               # React components
│   ├── ui/                   # shadcn/ui component library
│   │   ├── accordion.tsx
│   │   ├── alert-dialog.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── toast.tsx
│   │   └── [35+ UI components...]
│   ├── AgentSelector.tsx     # Multi-agent selection interface
│   ├── authentication.tsx    # User authentication component
│   ├── DeleteAccount.tsx     # Account deletion with confirmation dialog
│   └── voice-interface.tsx   # Main voice interaction component
├── config/
│   └── agent-configs.ts      # Therapeutic agent configurations
├── hooks/
│   ├── use-mobile.tsx        # Mobile detection hook
│   ├── use-toast.ts          # Toast notification hook
│   └── use-vapi.ts           # Voice AI integration hook
├── lib/
│   ├── queryClient.ts        # TanStack Query configuration
│   └── utils.ts              # Utility functions
├── pages/
│   ├── dashboard.tsx         # Main dashboard page
│   └── not-found.tsx         # 404 error page
├── App.tsx                   # Main application component
├── index.css                 # Global styles and Tailwind imports
└── main.tsx                  # Application entry point
```

### Key Frontend Files
- **`App.tsx`** - Main application with routing and theme provider
- **`voice-interface.tsx`** - Core voice interaction UI with session management
- **`AgentSelector.tsx`** - Multi-agent selection with Sarah and Mathew
- **`DeleteAccount.tsx`** - Account deletion component with confirmation dialog
- **`use-vapi.ts`** - Voice AI Platform integration and session handling
- **`agent-configs.ts`** - Therapeutic agent configurations and prompts
- **`authentication.tsx`** - Email-based user identification system

## Server Directory (`/server`)
Backend Express server with TypeScript and modular architecture.

```
server/
├── routes/                   # Modular route handlers
│   ├── auth-routes.ts        # User authentication and management routes
│   └── webhook-routes.ts     # VAPI webhook processing routes
├── services/                 # Business logic services
│   ├── css-pattern-service.ts # CSS pattern detection and analysis
│   ├── memory-service.ts     # Therapeutic memory and context management
│   ├── supabase-service.ts   # Database service interfaces
│   └── user-service.ts       # User management and cascade delete utilities
├── index.ts                  # Server entry point and configuration
├── routes.ts                 # Main route registration and setup
├── storage.ts                # Storage interface definitions
└── vite.ts                   # Vite integration for frontend serving
```

### Key Backend Files
- **`index.ts`** - Express server setup with middleware and error handling
- **`routes.ts`** - Main route registration and modular route mounting
- **`routes/auth-routes.ts`** - User authentication, context, and cascade delete endpoints
- **`routes/webhook-routes.ts`** - VAPI webhook processing and session management
- **`services/css-pattern-service.ts`** - CSS pattern detection and therapeutic analysis
- **`services/memory-service.ts`** - Manages therapeutic context and session memory
- **`services/supabase-service.ts`** - Database connection and type definitions
- **`services/user-service.ts`** - User management utilities and cascade delete logic
- **`storage.ts`** - Storage interface for database operations

## Shared Directory (`/shared`)
Common types and schemas shared between frontend and backend.

```
shared/
└── schema.ts                 # Drizzle ORM database schema definitions
```

### Database Schema
- **`users`** - User profiles with email and first name
- **`therapeutic_sessions`** - Voice session tracking with agent information
- **`therapeutic_context`** - Persistent memory and insights storage
- **`session_transcripts`** - Conversation history and transcripts
- **`css_patterns`** - CSS pattern detection with contradictions and behavioral gaps
- **`css_progressions`** - Stage transition tracking across therapeutic sessions

## Configuration Files

### Build & Development
- **`vite.config.ts`** - Frontend build configuration with aliases and plugins
- **`tailwind.config.ts`** - Custom styling with purple theme and glassmorphic design
- **`tsconfig.json`** - TypeScript compilation settings
- **`package.json`** - Dependencies and npm scripts

### Database & ORM
- **`drizzle.config.ts`** - Database migrations and schema management
- **Database**: PostgreSQL via Supabase with Drizzle ORM

### UI & Styling
- **`components.json`** - shadcn/ui component library configuration
- **`postcss.config.js`** - CSS processing with Tailwind and Autoprefixer
- **`index.css`** - Global styles, custom CSS variables, and glassmorphic effects

## Key Features by Directory

### Frontend Features
- **Voice Interface** - Real-time voice conversations with AI agents
- **Multi-Agent Support** - Sarah (emotional support) and Mathew (analytical)
- **Session Memory** - Persistent context across conversations
- **Authentication** - Email-based user identification
- **Account Management** - Account deletion with confirmation dialog
- **Responsive UI** - Purple glassmorphic design with dark theme

### Backend Features
- **Modular Route Structure** - Organized authentication and webhook routes
- **VAPI Integration** - Voice AI webhook processing and session management
- **CSS Pattern Detection** - Real-time therapeutic pattern analysis (CVDC, IBM, Thend, CYVC)
- **Memory System** - Therapeutic context building and retrieval with CSS awareness
- **Stage Progression Tracking** - Six-stage CSS therapeutic progression monitoring
- **Cascade Delete** - Complete user data removal with safety checks
- **Database Operations** - User, session, transcript, and pattern management
- **API Routes** - RESTful endpoints for frontend data access

### Database Features
- **User Management** - Profile storage and session tracking
- **Session Persistence** - Call history and agent information
- **Memory Context** - Therapeutic insights and conversation continuity
- **Transcript Storage** - Complete conversation history
- **CSS Pattern Storage** - Dedicated table for clean pattern storage with formatted contradictions
- **Progression Tracking** - Stage transitions with trigger content and confidence scoring

## Development Workflow

### Running the Application
```bash
npm run dev                   # Starts both frontend and backend
```

### Database Management
```bash
npm run db:push              # Push schema changes to database
npm run db:generate          # Generate migration files
```

### Testing
```bash
node test-cascade-delete.js  # Test cascade delete functionality
```

### File Organization Principles
- **Separation of Concerns** - Clear frontend/backend/shared boundaries
- **Component-Based** - Modular React components with single responsibilities
- **Service Layer** - Business logic separated from API routes
- **Type Safety** - Shared schemas ensure frontend/backend consistency
- **Configuration Driven** - Agent behaviors and UI themes easily configurable