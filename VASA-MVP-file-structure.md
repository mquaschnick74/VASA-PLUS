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
│       │   ├── therapist/
│       │   │   └── ClientSessionsView.tsx  # Client session details modal
│       │   ├── shared/
│       │   │   └── Header.tsx       # Navigation header (green glow logo)
│       │   ├── voice-interface.tsx  # Main voice UI with controls & 10min warning
│       │   ├── AgentSelector.tsx    # Multi-agent selection
│       │   ├── authentication.tsx   # Email auth flow
│       │   ├── DeleteAccount.tsx    # Account deletion
│       │   ├── PasswordReset.tsx    # Password reset flow
│       │   ├── SubscriptionStatus.tsx # Subscription tier display (simplified)
│       │   └── AIDisclosureCard.tsx # AI limitations dropdown
│       ├── config/
│       │   └── agent-configs.ts     # Agent v3: speak/meta separation
│       ├── hooks/
│       │   ├── use-vapi.ts         # VAPI WebSocket management
│       │   ├── use-subscription.ts  # Subscription data fetching
│       │   ├── use-toast.ts        # Notification system
│       │   └── use-mobile.tsx      # Responsive detection
│       ├── lib/
│       │   ├── queryClient.ts      # TanStack Query setup
│       │   ├── supabaseClient.ts    # Supabase client instance
│       │   ├── auth-helpers.ts      # Centralized logout handling
│       │   └── utils.ts            # Utility functions
│       ├── pages/
│       │   ├── dashboard.tsx        # Main routing dashboard
│       │   ├── therapist-dashboard.tsx  # Therapist view (client mgmt)
│       │   ├── client-dashboard.tsx     # Client view
│       │   ├── individual-dashboard.tsx # Individual user view
│       │   ├── partner-dashboard.tsx    # Partner revenue portal
│       │   ├── public-pricing.tsx   # Public pricing page
│       │   ├── blog-post-page.tsx   # Blog post viewer
│       │   ├── confirm.tsx         # Email confirmation page
│       │   ├── reset-password.tsx  # Password reset page
│       │   └── not-found.tsx       # 404 page
│       ├── App.tsx                 # Root component
│       ├── main.tsx                # React entry point
│       └── index.css               # Tailwind + glassmorphic styles (emerald green theme)
│
├── server/                          # Express backend
│   ├── middleware/
│   │   └── auth.ts                 # requireAuth & authenticateToken middleware
│   ├── routes/
│   │   ├── auth-routes.ts          # User auth & context
│   │   ├── therapist-routes.ts     # Therapist data access endpoints
│   │   ├── partner-routes.ts       # Partner revenue & analytics
│   │   ├── subscription-routes.ts  # Subscription status endpoints
│   │   ├── stripe-routes.ts        # Stripe customer portal integration
│   │   ├── blog-routes.ts          # Blog management endpoints
│   │   ├── vapi-routes.ts          # VAPI configuration endpoints
│   │   └── webhook-routes.ts       # VAPI webhook handler
│   ├── services/
│   │   ├── orchestration-service.ts # Session management + meta parsing
│   │   ├── css-pattern-service.ts   # CSS stage detection
│   │   ├── memory-service.ts        # Context persistence
│   │   ├── summary-service.ts       # Session summarization
│   │   ├── subscription-service.ts  # Subscription limits & tracking
│   │   ├── therapist-data-service.ts # Client data access with audit logs
│   │   ├── user-service.ts          # User management
│   │   ├── distress-detection-service.ts # Crisis detection
│   │   ├── enhanced-therapeutic-tracker.ts # Advanced tracking
│   │   └── supabase-service.ts      # Database client
│   ├── utils/
│   │   └── parseAssistantOutput.ts  # Speak/meta tag parser
│   ├── index.ts                     # Server entry
│   ├── routes.ts                    # Route registration
│   ├── storage.ts                   # Storage interfaces
│   └── vite.ts                      # Frontend serving
│
├── shared/
│   └── schema.ts                    # Drizzle ORM schemas
│
└── attached_assets/                 # User uploads & screenshots

```

## Key Components

### Frontend Features
- **Voice Interface** - Real-time call controls, status display
- **Agent Selector** - Sarah (emotional) & Mathew (analytical)
- **AI Disclosure** - Red alert dropdown with limitations & crisis info
- **Mobile Responsive** - Full mobile optimization with scaling UI
- **Role-Based Dashboards** - Separate views for therapist/client/individual/partner
- **Subscription Tracking** - Simplified tier display with detailed metric cards
- **Client Management** - Invitation system, session viewing, audit logging
- **Partner Portal** - Revenue tracking, therapist attribution, equity management
- **Navigation** - Green glow logo with text-only glassmorphic emerald buttons

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
user_profiles                      # User accounts (therapist/client/individual/partner)
therapist_client_relationships     # Therapist-client connections
subscriptions                      # Subscription plans, limits, usage tracking
therapeutic_sessions               # Voice session metadata
therapeutic_context                # Persistent memory/insights
session_transcripts                # Full conversations (end-of-call only)
css_patterns                       # Detected patterns + metadata
audit_logs                         # HIPAA-compliant access logs
partner_organizations              # Partner organization details
partner_users                      # Partner user access management
partner_therapist_attribution      # Therapist-partner linkage & revenue
partner_revenue_transactions       # Detailed revenue transactions
partner_metrics_snapshots          # Periodic metrics aggregation
partner_equity_vesting_schedule    # Equity vesting timeline
blog_posts                         # Public blog content
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
POST   /api/auth/user                # User login/registration
GET    /api/auth/user-context/:id    # Memory retrieval
DELETE /api/auth/delete-account      # Cascade delete
```

### Subscription
```
GET    /api/subscription/status/:userId  # Subscription limits & usage
```

### Therapist
```
GET    /api/therapist/clients        # Client list with session stats
POST   /api/therapist/invite         # Send client invitation
GET    /api/therapist/invitations    # Pending invitations
GET    /api/therapist/client/:id/sessions  # Client session history
GET    /api/therapist/session/:id/summary  # Session summary
GET    /api/therapist/session/:id/transcript # Full transcript
```

### Partner
```
GET    /api/partner/dashboard        # Revenue & analytics overview
GET    /api/partner/therapists       # Attributed therapist list
GET    /api/partner/transactions     # Revenue transaction history
```

### Stripe
```
POST   /api/stripe/create-portal-session  # Customer portal access
```

### VAPI Integration
```
POST   /api/vapi/webhook             # Event processing
GET    /api/vapi/config              # Agent configuration
```

### Blog
```
GET    /api/blog/posts               # List all blog posts
GET    /api/blog/posts/:slug         # Get single post by slug
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

### October 2025
- ✅ **Subscription Display Improvements (Oct 29)**
  - Fixed client limit display bug (now uses API data vs hardcoded logic)
  - Updated Premium therapist tier to 1080 minutes (from 1000)
  - Simplified SubscriptionStatus component (removed redundant progress bars)
  - Detailed stats shown in individual dashboard cards
  - Backend API properly returns `client_limit` and `clients_used` fields
- ✅ **Live Conversation Assessment (Oct 29)**
  - Identified non-functional placeholder UI for text-to-text transcription
  - VAPI events received but not displayed in real-time
  - Recommendation for removal or full implementation pending
- ✅ **Navigation Redesign (Oct 28)**
  - Text-only glassmorphic emerald green navigation buttons
  - Green glow logo (iVASA_logo_with_green_glow)
  - Removed icon-based navigation in favor of text clarity
- ✅ **Role-Based Dashboard System (Oct 2025)**
  - Therapist dashboard with client management and invitation system
  - Client dashboard with therapist subscription sharing
  - Individual dashboard for standalone users
  - Partner dashboard with revenue/equity/analytics tracking
- ✅ **Stripe Customer Portal Integration (Oct 16)**
  - Smart button: "Upgrade Plan" for trials, "Manage Subscription" for paid users
  - Secure authentication-based access (requireAuth middleware)
  - Full subscription management (payment, invoices, plans, cancellation)
- ✅ **Client Invitation System (Oct 8)**
  - Fixed silent failure for existing client invitations
  - Creates therapist_invitations record for all invitation types
  - Fixed missing updated_at column causing database trigger failures
  - Proper rollback on email sending failures
- ✅ **Partner Revenue Portal (Oct 2025)**
  - Revenue/equity/therapist/referral management tabs
  - Tier progression (Bronze → Silver → Gold → Platinum)
  - Transaction history with filtering and pagination
  - Growth analytics with visualizations
  - Vesting schedule management for equity partners
- ✅ Natural voice agents v3 with speak/meta separation
- ✅ Mobile-responsive UI with proper dropdown positioning
- ✅ AI disclosure card with crisis hotline info
- ✅ Efficient transcript storage (end-of-call only)
- ✅ Fixed CSS pattern detection with flexible regex
- ✅ Two-tier cache system with race protection
- ✅ 10-minute VAPI call limit warning system with auto-disconnect
- ✅ Password reset flow with Supabase integration
- ✅ Enhanced therapeutic tracking and distress detection services
- ✅ HIPAA-compliant audit logging for therapist data access