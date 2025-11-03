# VASA - Therapeutic Voice Assistant MVP

## Overview
VASA is an AI-powered therapeutic voice assistant designed to provide real-time conversational state sensing (CSS) and persistent memory across sessions. It supports a multi-agent system and offers role-based dashboards for Therapists, Clients, Individuals, and Partners. The platform includes a subscription system with usage tracking, a client invitation mechanism, partner revenue tracking, and HIPAA-compliant audit logging. VASA aims to offer a secure, intuitive, and effective tool for therapeutic interactions, featuring a glassmorphic UI with purple theming and mobile-responsive design.

## User Preferences
- Simple, everyday language communication
- Mobile-responsive design priority
- Privacy-focused data handling

## System Architecture

### UI/UX Decisions
- **Design System**: Glassmorphic UI with purple theming, built with shadcn/ui and Radix UI primitives.
- **Styling**: Tailwind CSS for a modern, responsive aesthetic.
- **Mobile Responsiveness**: Comprehensive mobile-first design implemented across all pages, including authentication and dashboards.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, TanStack Query for data fetching, and wouter for routing.
- **Backend**: Express.js with TypeScript, utilizing PostgreSQL and Drizzle ORM for database management.
- **Voice Integration**: VAPI Platform for real-time voice processing and WebSocket connections, supporting a multi-agent system (Sarah, Mathew, Crisis Module) with natural voice `<speak>` and `<meta>` tag separation.
- **Authentication & Security**: Supabase Auth with email verification, `requireAuth` middleware for blocking unauthorized access, centralized logout handling, and HIPAA-compliant audit logging for all therapist data access.
- **Session Management**: Features a two-tier caching system with active and checked sessions, promise-based initialization locks for race protection, 30-minute stale session auto-cleanup, and transcript hash tracking to prevent duplicates.
- **Data Handling**: Efficient transcript storage at the end of calls and specific display rules for conversational summaries and session insights on client/individual dashboards.

### Feature Specifications
- **Role-Based Dashboards**:
    - **Therapist**: Client management, invitation system, usage monitoring, personal voice sessions.
    - **Client**: Access to therapist information and voice sessions under the therapist's subscription.
    - **Individual**: Personal voice sessions with an individual subscription.
    - **Partner**: Revenue tracking, therapist attribution, equity management, referral analytics.
- **Subscription System**: Tier-based limits (Trial, Plus, Premium, Pro), usage tracking, client slot tracking for therapists, and integration with Stripe Customer Portal for subscription management.
- **Client Invitation System**: Email-based invitations with secure, token-based links and automatic acceptance upon email verification, tracking `therapist_client_relationships`.
- **Therapist Data Access**: View client sessions, summaries, transcripts, with all access logged to `audit_logs`.
- **Partner Portal**: Comprehensive dashboard for revenue, equity, therapist attribution, referral analytics, and transaction history, supporting various partnership models.
- **CSS Pattern Detection**: Implements detection for CVDC, IBM, Thend, CYVC patterns, and tracks Symbolic/Imaginary/Real dominance.

### System Design Choices
- **Database Schema**: Structured for user profiles, relationships, subscriptions, sessions, context, transcripts, CSS patterns, audit logs, and detailed partner management.
- **Development Workflow**: Emphasizes Drizzle ORM for schema changes, discouraging manual SQL migrations.

## External Dependencies
- **Supabase**: Used for authentication services and as the primary database backend (PostgreSQL).
- **VAPI Platform**: Provides core voice processing capabilities and webhook integration.
- **Stripe**: Integrated for subscription management and customer portal functionality.
- **PostgreSQL**: The relational database management system.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.