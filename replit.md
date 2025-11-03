# VASA - Therapeutic Voice Assistant MVP

## Overview
VASA is an AI-powered therapeutic voice assistant designed to provide real-time conversational state sensing (CSS) and persistent memory across sessions. It supports multi-agent interactions and offers role-based dashboards for Therapists, Clients, Individuals, and Partners. The platform includes a subscription system for usage tracking, a client invitation system, partner revenue tracking, and HIPAA-compliant audit logging. The project aims to deliver a valuable tool for mental wellness, with a vision for market growth and impact.

## User Preferences
- Simple, everyday language communication
- Mobile-responsive design priority
- Privacy-focused data handling

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, and Vite, utilizing `shadcn/ui` and Radix UI primitives. It features a glassmorphic emerald green design implemented with Tailwind CSS. Navigation is text-based.

### Technical Implementations
- **Role-Based Dashboards**: Therapist, Client, Individual, and Partner dashboards with specific functionalities.
- **Subscription System**: Manages usage tracking (minutes, client slots) with tier-based plans (Trial, Intro, Plus, Complete, Premium) and integrates with Stripe for billing and subscription management.
- **Client Invitation System**: Therapists can invite clients via email using secure, token-based links.
- **Therapist Data Access**: Therapists can view client sessions, conversational summaries, and full transcripts, with all access logged for HIPAA compliance.
- **Partner Portal**: Comprehensive dashboard for revenue tracking, therapist attribution, equity management, referral analytics, and transaction history.
- **CSS Pattern Detection**: Detects conversational patterns such as Contradiction detection (CVDC), Intention-behavior mismatch (IBM), Therapeutic shift moments (Thend), and Choice/flexibility emergence (CYVC).
- **Multi-Agent System (v3)**: Supports agents like "Sarah" (emotional support) and "Mathew" (analytical), with natural voice capabilities using `<speak>` and `<meta>` tags separation. Includes a Crisis Module for grounding techniques.
- **Session Management**: Implements a two-tier cache with race protection and auto-cleanup for efficient session handling and duplicate prevention.

### System Design Choices
- **Frontend**: React 18 + TypeScript + Vite, `shadcn/ui`, Tailwind CSS, TanStack Query for data fetching, wouter for routing.
- **Backend**: Express.js + TypeScript, PostgreSQL database managed by Drizzle ORM and Supabase.
- **Voice Integration**: VAPI Platform for voice processing, real-time WebSocket connection management, and memory context injection.
- **Authentication & Security**: Supabase Auth with email verification, `requireAuth` middleware for unauthorized request blocking, and HIPAA-compliant audit logging for therapist data access.
- **Database Schema**: Key tables include `user_profiles`, `therapist_client_relationships`, `subscriptions`, `therapeutic_sessions`, `therapeutic_context`, `session_transcripts`, `css_patterns`, `audit_logs`, and comprehensive tables for partner management (`partner_organizations`, `partner_users`, `partner_therapist_attribution`, `partner_revenue_transactions`, `partner_metrics_snapshots`, `partner_equity_vesting_schedule`).

## External Dependencies
- **Supabase**: Database services, authentication, and storage.
- **VAPI Platform**: AI voice processing and webhook integration.
- **Stripe**: Subscription management and billing portal.
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Database schema management and migrations.
- **OpenAI API**: Used by VAPI agents (requires active credits).