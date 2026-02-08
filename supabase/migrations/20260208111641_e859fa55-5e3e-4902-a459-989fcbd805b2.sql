
-- Add urgency level and trigger message to slack_processed_messages
ALTER TABLE public.slack_processed_messages
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS trigger_message text;

-- Also add urgency to nudge_followups for sorting
ALTER TABLE public.nudge_followups
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'medium';
