# VASA - Therapeutic Voice Assistant MVP

## Overview
AI-powered therapeutic voice assistant with real-time CSS (Conversational State Sensing) pattern detection, multi-agent support, and persistent memory across sessions. Features role-based dashboards (Therapist/Client/Individual/Partner), subscription-based usage tracking, client invitation system, partner revenue tracking, and HIPAA-compliant audit logging. Glassmorphic UI with emerald green theming and mobile-responsive design. New users complete the start.ivasa.ai assessment (5-question Inner Landscape quiz) during onboarding.

## File Structure

```
vasa-mvp/
├── client/
│   ├── public/
│   │   ├── og-image.png              # Social media preview image
│   │   ├── favicon.png               # Browser tab icon
│   │   └── apple-touch-icon.png      # iOS home screen icon
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components
│   │   │   ├── therapist/
│   │   │   │   └── ClientSessionsView.tsx  # Client session details modal
│   │   │   ├── voice-interface.tsx   # Main voice UI with call controls
│   │   │   ├── AgentSelector.tsx     # Multi-agent selection UI
│   │   │   ├── authentication.tsx    # Email auth component
│   │   │   ├── DeleteAccount.tsx     # Account deletion UI
│   │   │   ├── SubscriptionStatus.tsx # Usage tracking display
│   │   │   └── AIDisclosureCard.tsx  # AI limitations dropdown
│   │   ├── config/
│   │   │   └── agent-configs.ts      # Sarah/Mathew agent definitions v3
│   │   ├── hooks/
│   │   │   ├── use-vapi.ts          # VAPI WebSocket management
│   │   │   └── use-subscription.ts   # Subscription data fetching
│   │   ├── pages/
│   │   │   ├── dashboard.tsx         # Main routing page
│   │   │   ├── therapist-dashboard.tsx  # Therapist view
│   │   │   ├── client-dashboard.tsx  # Client view
│   │   │   └── partner-dashboard.tsx # Partner revenue portal
│   │   ├── lib/
│   │   │   ├── queryClient.ts        # TanStack Query setup
│   │   │   ├── auth-helpers.ts       # Centralized logout handling
│   │   │   ├── supabaseClient.ts     # Supabase auth client
│   │   │   └── utils.ts              # Utility functions
│   │   ├── App.tsx                   # Root app component
│   │   └── index.css                 # Tailwind + glassmorphic styles
│   └── index.html                    # Entry HTML with SEO meta tags
│
├── server/
│   ├── routes/
│   │   ├── auth-routes.ts            # Authentication endpoints
│   │   ├── therapist-routes.ts       # Therapist data access endpoints
│   │   ├── partner-routes.ts         # Partner revenue & analytics endpoints
│   │   ├── vapi-routes.ts            # VAPI configuration endpoints
│   │   └── webhook-routes.ts         # VAPI webhook handler
│   ├── services/
│   │   ├── orchestration-service.ts  # Session & transcript management
│   │   ├── therapist-data-service.ts # Client data access with audit logs
│   │   ├── css-pattern-service.ts    # CSS stage detection (CVDC/IBM/Thend/CYVC)
│   │   ├── memory-service.ts         # Context building & persistence
│   │   ├── supabase-service.ts       # Database client
│   │   └── auth-service.ts           # User authentication
│   ├── middleware/
│   │   └── auth.ts                   # requireAuth & authenticateToken
│   ├── utils/
│   │   └── parseAssistantOutput.ts   # Speak/meta tag parser
│   ├── storage.ts                    # Storage interfaces
│   ├── index.ts                      # Express server entry
│   └── vite.ts                       # Vite dev server integration
│
├── shared/
│   └── schema.ts                     # Drizzle ORM schemas
│
├── drizzle/
│   └── migrations/                   # Database migrations
│
└── attached_assets/                  # User-uploaded assets
```

## Key Features

### Role-Based Dashboards
- **Therapist Dashboard**: Client management, invitation system, usage monitoring, own voice sessions
- **Client Dashboard**: Therapist info, voice sessions using therapist's subscription
- **Individual Dashboard**: Personal voice sessions with own subscription
- **Partner Dashboard**: Revenue tracking, therapist attribution, equity management, referral analytics

### Subscription System
- **Usage Tracking**: Minutes used/remaining display with progress bars
- **Tier-based Limits**: Trial (15 min), Plus (100 min), Pro (unlimited)
- **Client Transparency**: Shows "used by ALL clients" for therapist subscription usage
- **7-day free trial**: No credit card required promotional messaging
- **Stripe Customer Portal**: Smart button that shows "Upgrade Plan" for trial users and "Manage Subscription" for paid subscribers
  - Secure authentication-based access (requireAuth middleware)
  - Opens Stripe portal in new tab for subscription management
  - Users can update payment methods, view invoices, change plans, and cancel subscriptions

### Client Invitation System
- **Email Invitations**: Therapists can invite clients via email
- **Token-based**: Secure invitation links with unique tokens
- **Auto-acceptance**: Invitation processed after email verification
- **Relationship Tracking**: therapist_client_relationships table

### Therapist Data Access
- **Session List**: View all client sessions with timestamps
- **View Summary**: Modal showing conversational summary and session insights
- **View Transcript**: Modal showing full conversation history
- **HIPAA Audit Logging**: All data access logged to audit_logs table

### Partner Portal
- **Revenue Dashboard**: Track total revenue, partner share, and monthly recurring revenue
- **Therapist Attribution**: Monitor attributed therapists, their usage, and revenue generation
- **Tier System**: Bronze/Silver/Gold/Platinum progression based on MRR thresholds
- **Equity Management**: Vested/unvested equity tracking with vesting schedules
- **Referral Network**: Direct/indirect referral tracking with network bonuses
- **Analytics**: Growth metrics, usage patterns, and session analytics with visualizations
- **Transaction History**: Detailed revenue transaction logs with filtering
- **Partnership Models**: Support for revenue share, equity, and hybrid partnerships

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
user_profiles                      # User accounts (therapist/client/individual/partner)
therapist_client_relationships     # Therapist-client connections
subscriptions                      # Subscription plans and limits
therapeutic_sessions               # Voice session metadata
therapeutic_context                # Persistent memory/insights
session_transcripts                # Full conversation history (end-of-call only)
css_patterns                       # Detected therapeutic patterns
audit_logs                         # HIPAA-compliant access logs
partner_organizations              # Partner organization details
partner_users                      # Partner user access management
partner_therapist_attribution      # Therapist-partner linkage & revenue tracking
partner_revenue_transactions       # Detailed revenue transactions
partner_metrics_snapshots          # Periodic metrics aggregation
partner_equity_vesting_schedule    # Equity vesting timeline
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

### Authentication & Security
- **Supabase Auth**: Email verification required
- **requireAuth middleware**: Blocks unauthorized requests (401)
- **Centralized logout**: handleLogout helper prevents localStorage issues
- **HIPAA Audit Logging**: All therapist data access logged

## User Preferences
- Simple, everyday language communication
- Mobile-responsive design priority
- Privacy-focused data handling

## Recent Updates (Nov 2025)
- **OnboardingQuestionnaire Removal (Nov 10)**: Replaced the internal 2-question onboarding (Your Voice/Your Journey) with the start.ivasa.ai assessment iframe
  - New user flow: Sign up → Consent → Assessment (start.ivasa.ai) → Dashboard
  - Removed OnboardingQuestionnaire component from flow
  - Assessment is now the only onboarding step
  - Users who completed assessment proceed directly to dashboard
- **Logo Updates (Nov 9-10)**: 
  - Moved iVASA_Heiti.png to landing page (above "Your Voice. Your Journey." titles)
  - Header logo changed to apple-touch-icon.png (simple icon)
  - Updated og-image.png with "Discover" section featuring emerald green button

## Previous Updates (Oct 2025)
- **Stripe Customer Portal (Oct 16)**: Integrated Stripe billing portal for subscription management
  - Smart button: "Upgrade Plan" for trial users, "Manage Subscription" for paid subscribers
  - Secure authentication-based access using requireAuth middleware
  - Users can update payment methods, view invoices, change plans, and cancel subscriptions
  - Opens portal in new tab with automatic return to dashboard
- **Invitation System Fix (Oct 8)**: Fixed silent failure when inviting existing clients
  - Now creates `therapist_invitations` record for both new AND existing clients
  - Fixed missing `updated_at` column causing silent database trigger failures
  - Pending invitations now appear correctly in therapist dashboard
  - Proper rollback on email sending failures for data integrity
- **Partner Portal**: Full revenue tracking and analytics dashboard
  - Revenue/equity/therapist/referral management tabs
  - Tier progression system (Bronze → Silver → Gold → Platinum)
  - Transaction history with filtering and pagination
  - Growth analytics with visualizations (charts/graphs)
  - Therapist attribution and performance tracking
  - Vesting schedule management for equity partners
- **Role-Based System**: Therapist/client/individual/partner dashboards with full functionality
- **Subscription Management**: Usage tracking, tier-based limits, transparent client usage display
- **Client Invitation**: Email-based invitation system with secure token handling
- **Therapist Data Access**: View client sessions, summaries, and transcripts with audit logging
- **Mobile Responsiveness**: Comprehensive mobile-first design
  - Authentication page: Centered content, responsive text, flexible padding
  - Dashboard headers: Stacked buttons on mobile, responsive text sizes
  - Promotional text: "7 day free trial, No credit card required"
- **Branding Assets**: og-image.png, favicon.png, apple-touch-icon.png
- **Logout Bug Fix**: Fixed partner-dashboard.tsx logout button (removed localStorage.clear() calls)
- **Auth Improvements**: requireAuth middleware returns 401 for unauthorized requests
- Natural voice configuration (v3) with speak/meta separation
- AI disclosure card with crisis hotline info
- Efficient transcript storage (end-of-call only)
- CSS pattern detection with flexible regex patterns

## Important Implementation Notes

### Logout Pattern
- **NEVER** call `localStorage.clear()` or `sessionStorage.clear()` while components are mounted
- Always use `handleLogout()` from `@/lib/auth-helpers` which only calls `supabase.auth.signOut()`
- This prevents React event handlers from breaking

### Routing
- Uses **wouter** (NOT react-router-dom)
- Use `useLocation`/`setLocation` instead of `useNavigate`

### Authentication
- **requireAuth middleware**: Blocks unauthorized requests (401 response)
- **authenticateToken**: Does NOT block, just attaches user info

### Display Summaries
- `buildUserDisplayContext` excludes `call_summary`
- Only shows `conversational_summary` and `session_insight` on client/individual dashboards
- Full access for therapists via therapist-routes

### Database Operations
- Use `npm run db:push` for schema changes (never manual SQL migrations)
- Use `npm run db:push --force` if data-loss warning appears
