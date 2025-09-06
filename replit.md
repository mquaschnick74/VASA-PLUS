# VASA - Therapeutic Voice Assistant

## Overview

VASA is a therapeutic voice assistant application that provides AI-powered mental health support through voice interactions. The system combines modern web technologies with AI voice processing capabilities to deliver a therapeutic conversational experience. It features persistent memory capabilities to maintain context across sessions, user authentication, and a modern glassmorphic UI with purple theming.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The application uses a React-based frontend built with Vite for fast development and optimized builds. The UI is constructed using shadcn/ui components with Radix UI primitives, styled with Tailwind CSS featuring a custom dark theme with purple accents and glassmorphic design elements. The frontend follows a component-based architecture with shared UI components and custom hooks for state management.

### Backend Architecture
The backend is an Express.js server with TypeScript support. It follows a modular structure with separate route handlers and service layers. The server handles authentication, session management, and integrates with external AI services. The architecture separates concerns between API routes, business logic services, and data access layers.

### Database Design
The system uses PostgreSQL as the primary database with Drizzle ORM for type-safe database interactions. The schema includes:
- **Users table**: Stores user profiles with email and basic information
- **Therapeutic sessions**: Tracks voice interaction sessions with metadata
- **Therapeutic context**: Maintains persistent memory and insights across sessions
- **Session transcripts**: Stores conversation history for context building

The database design prioritizes user privacy and therapeutic continuity through structured context storage.

### Authentication & Session Management
The application implements a simple email-based user identification system. Users are identified by email addresses and can provide optional first names. Session state is managed through localStorage on the client side and server-side session tracking for therapeutic continuity.

### Voice Integration Architecture
The system integrates with VAPI (Voice AI Platform) for voice processing capabilities. The voice interface supports:
- Real-time voice conversations with AI agents
- Dynamic agent configuration with user context
- Session state management with connection status tracking
- Memory context injection for personalized therapeutic experiences

The voice integration uses a custom React hook (useVapi) that manages WebSocket connections, handles voice session lifecycle, and provides real-time status updates.

### Memory & Context System
A sophisticated memory management system builds therapeutic context by:
- Analyzing previous session data and insights
- Storing conversation summaries and key therapeutic points
- Dynamically injecting relevant context into new voice sessions
- Maintaining conversation continuity across multiple interactions

The memory service processes session data to extract meaningful insights and maintains a confidence-scored context system for relevant information retrieval.

## External Dependencies

### Core Technologies
- **React 18** with TypeScript for frontend development
- **Express.js** for backend API server
- **PostgreSQL** with Drizzle ORM for data persistence
- **Vite** for frontend build tooling and development server

### UI Framework
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for styling with custom design system
- **Radix UI** primitives for accessible component foundations

### Voice AI Integration
- **VAPI (Voice AI Platform)** for voice processing and AI agent interactions
- **@vapi-ai/web** SDK for client-side voice interface management

### Database & Storage
- **Neon Database** (@neondatabase/serverless) for serverless PostgreSQL hosting
- **Supabase** (@supabase/supabase-js) for additional database services and real-time features
- **Drizzle Kit** for database migrations and schema management

### Development & Build Tools
- **TypeScript** for type safety across the full stack
- **ESBuild** for production server bundling
- **PostCSS** with Autoprefixer for CSS processing
- **Replit** integration tools for development environment

### Additional Libraries
- **TanStack Query** for client-side data fetching and caching
- **React Hook Form** with Zod resolvers for form management
- **date-fns** for date manipulation
- **clsx** and **class-variance-authority** for conditional styling
- **wouter** for client-side routing