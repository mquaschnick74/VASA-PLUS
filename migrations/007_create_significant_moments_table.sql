-- Create the significant_moments table for storing therapeutic session moments
-- detected by the sensing layer during live sessions.

CREATE TABLE IF NOT EXISTS public.significant_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  exchange_number INTEGER NOT NULL,
  moment_type TEXT NOT NULL,
  description TEXT NOT NULL,
  guidance JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying moments by session
CREATE INDEX IF NOT EXISTS idx_significant_moments_session_id ON public.significant_moments (session_id);

-- Index for querying moments by user
CREATE INDEX IF NOT EXISTS idx_significant_moments_user_id ON public.significant_moments (user_id);

-- Index for querying moments by call
CREATE INDEX IF NOT EXISTS idx_significant_moments_call_id ON public.significant_moments (call_id);

-- Enable RLS
ALTER TABLE public.significant_moments ENABLE ROW LEVEL SECURITY;
