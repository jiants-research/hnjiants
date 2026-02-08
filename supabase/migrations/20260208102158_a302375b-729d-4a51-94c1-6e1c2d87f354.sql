
-- Table: processed Slack messages cache (prevents duplicate analysis/nudges)
CREATE TABLE public.slack_processed_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slack_message_ts TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  is_actionable BOOLEAN NOT NULL DEFAULT false,
  task_summary TEXT,
  deadline TEXT,
  assignee TEXT,
  ai_nudge_draft TEXT,
  nudge_sent BOOLEAN NOT NULL DEFAULT false,
  nudge_sent_at TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slack_message_ts, channel_id)
);

ALTER TABLE public.slack_processed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their processed messages"
  ON public.slack_processed_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert processed messages"
  ON public.slack_processed_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their processed messages"
  ON public.slack_processed_messages FOR UPDATE
  USING (auth.uid() = user_id);

-- Table: follow-up queue for T+2 day reminders
CREATE TABLE public.nudge_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processed_message_id UUID NOT NULL REFERENCES public.slack_processed_messages(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  slack_message_ts TEXT NOT NULL,
  task_summary TEXT NOT NULL,
  assignee TEXT,
  followup_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'resolved')),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nudge_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their followups"
  ON public.nudge_followups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert followups"
  ON public.nudge_followups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their followups"
  ON public.nudge_followups FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_processed_messages_channel ON public.slack_processed_messages(channel_id);
CREATE INDEX idx_processed_messages_user ON public.slack_processed_messages(user_id);
CREATE INDEX idx_followups_status ON public.nudge_followups(status, followup_at);
CREATE INDEX idx_followups_user ON public.nudge_followups(user_id);

-- Trigger for updated_at on processed messages
CREATE TRIGGER update_slack_processed_messages_updated_at
  BEFORE UPDATE ON public.slack_processed_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
