# VASA - AI-Powered Therapeutic Voice Assistant

## Overview
VASA (Variable Assessment Solution Agent) is an AI-powered therapeutic voice assistant platform designed to provide natural and effective voice therapy sessions. It features real-time Conversational State Sensing (CSS) pattern detection, multi-agent support, and persistent memory across sessions. The platform supports various user roles, including Therapists, Clients, Individuals, Partners, Influencers, and Admins, each with tailored dashboards and functionalities. Key capabilities include subscription management, client invitation systems, HIPAA-compliant audit logging, influencer commission tracking, a comprehensive blog, and advanced PsychoContextual Analysis (PCA) for deep therapeutic insights. The business vision is to revolutionize mental wellness support through accessible, AI-driven therapeutic conversations, expanding into broader markets by empowering both individual users and mental health professionals, and leveraging partnerships and influencer networks for growth.

## User Preferences
- Simple, everyday language communication
- Mobile-responsive design priority
- Privacy-focused data handling
- No emojis in communication unless explicitly requested

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, and Vite, utilizing `shadcn/ui` and Radix UI for components. Styling is managed with Tailwind CSS, featuring a glassmorphic design theme with an emerald green accent. The design prioritizes a clean, modern aesthetic with a focus on user experience across various roles.

### Technical Implementations
- **Frontend:** React 18, TypeScript, Vite, TanStack Query v5 for server state, wouter for routing, react-hook-form with zodResolver for forms, lucide-react and react-icons for iconography, and `@vapi-ai/web` SDK for voice interface.
- **Backend:** Node.js with Express.js, TypeScript, PostgreSQL (Neon-backed via Replit/Supabase), Drizzle ORM, Supabase Auth, VAPI for voice processing webhooks, OpenAI GPT-4o for AI models, Resend API for transactional emails, and Stripe for payments.
- **Development:** Vite for frontend build, esbuild for backend, npm for package management, TypeScript 5.6.3 for type checking, and Drizzle Kit for database migrations.

### Feature Specifications
- **Voice Therapy Sessions:** Real-time voice processing via VAPI, natural conversation flow using `<speak>` and `<meta>` tags, persistent session memory through CSS pattern tracking, and support for four specialized therapeutic agents (Sarah, Mathew, Marcus, Zhanna). Includes a crisis module for acute distress.
- **CSS Pattern Detection:** Real-time detection of therapeutic patterns like Contradiction (CVDC), Intention-Behavior Mismatch (IBM), Therapeutic Shift (Thend), Choice/Contextual Variation (CYVC), and Register Tracking, progressing through defined CSS stages.
- **Role-Based Dashboards:** Specialized dashboards for Individual, Therapist, Client, Partner, Influencer, and Admin roles, each providing tailored features and data access.
- **Subscription System:** Tiered subscriptions (Trial, Plus, Pro, Premium) with real-time usage tracking, progress bars, and integration with Stripe for secure checkout, webhooks, and customer portal management.
- **Client Invitation System:** Therapists can invite clients via email using secure, expiring tokens, facilitating the creation of `therapist_client_relationships`.
- **Assessment & Onboarding:** Integration with `start.ivasa.ai` for a 5-question "Inner Landscape Assessment" embedded into the user flow, capturing profile data and insights.
- **Therapist Data Access (HIPAA-Compliant):** Therapists can view client session lists, summaries, and full transcripts, with all access being logged to `therapist_access_logs` for audit purposes.
- **Partner Program:** Supports various partnership models (revenue share, equity), tracks revenue, manages therapist attribution, and includes a tiered system and referral network.
- **Influencer Program:** Tracks content performance, clicks, conversions, and manages commissions (default 15%), promo codes, and a multi-level referral network.
- **Blog System:** Publicly accessible blog with SEO optimization, and an admin interface for managing posts (create, edit, publish, draft).
- **PCA Master Analyst:** An AI-powered deep analysis of therapeutic sessions using OpenAI's GPT-4o-mini model, applying Pure Contextual Perception (PCP) theory and PsychoContextual Analysis (PCA) methodology to generate clinical assessments and condensed agent contexts.
- **FAQ System:** Categorized FAQ section for general, therapist, client, settings, billing, and technical support queries.
- **Settings Pages:** Consolidated user settings for account management, subscription & billing, and support.
- **Memory & Context System:** Utilizes a two-tier cache (`activeSessions` Map, `checkedSessions` Set) for session state and context persistence, with race protection and auto-cleanup mechanisms. Context is built from recent sessions, CSS patterns, and therapeutic insights to generate memory prompts for the AI agent.
- **Authentication & Authorization:** Supabase Auth for email verification, with `requireAuth` middleware for blocking unauthorized requests and `authenticateToken` for attaching user information. Features HIPAA audit logging and role-based route protection.

### System Design Choices
- **Microservice-like structure:** Backend services are logically separated (e.g., `orchestration-service`, `memory-service`, `css-pattern-service`).
- **ORM:** Drizzle ORM is chosen for type-safe database interactions and schema management.
- **Real-time capabilities:** VAPI integration for voice and WebSocket management via `use-vapi` hook for dynamic interactions.
- **Scalability:** Supabase for authentication and PostgreSQL/Neon for database provide a scalable foundation.
- **Security:** Focus on HIPAA compliance for therapist data access, secure token handling for invitations, and robust authentication middleware.

## External Dependencies
- **Supabase:** Authentication (Auth) and Database (PostgreSQL) services.
- **VAPI:** Real-time voice processing and webhook handling.
- **OpenAI:** AI models (GPT-4o, GPT-4o-mini) for therapeutic agents and PCA analysis.
- **Stripe:** Subscription management, payment processing, webhooks, and customer portal.
- **Resend:** Transactional email sending.
- **start.ivasa.ai:** External platform for the "Inner Landscape Assessment" integrated via iframe.