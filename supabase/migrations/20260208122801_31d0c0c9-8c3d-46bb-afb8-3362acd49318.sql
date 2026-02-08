
-- Store PM tool configuration per user
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,        -- 'linear', 'jira', 'asana', 'webhook'
  config JSONB DEFAULT '{}',     -- domain, project_id, team_id, webhook_url, etc. (non-secret config)
  api_token TEXT,                -- encrypted API token (stored server-side, accessed only via edge function)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own integrations"
  ON public.integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integrations"
  ON public.integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations"
  ON public.integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integrations"
  ON public.integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add external task tracking columns to existing tables
ALTER TABLE public.slack_processed_messages
  ADD COLUMN external_task_id TEXT,
  ADD COLUMN external_task_url TEXT;

ALTER TABLE public.nudge_followups
  ADD COLUMN external_task_id TEXT,
  ADD COLUMN external_task_url TEXT;
