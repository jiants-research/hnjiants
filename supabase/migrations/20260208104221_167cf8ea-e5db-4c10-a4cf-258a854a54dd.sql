
-- Drop restrictive policies on slack_processed_messages
DROP POLICY IF EXISTS "Users can view their processed messages" ON public.slack_processed_messages;
DROP POLICY IF EXISTS "Users can insert processed messages" ON public.slack_processed_messages;
DROP POLICY IF EXISTS "Users can update their processed messages" ON public.slack_processed_messages;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Users can view their processed messages"
  ON public.slack_processed_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert processed messages"
  ON public.slack_processed_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their processed messages"
  ON public.slack_processed_messages FOR UPDATE
  USING (auth.uid() = user_id);

-- Drop restrictive policies on nudge_followups
DROP POLICY IF EXISTS "Users can view their followups" ON public.nudge_followups;
DROP POLICY IF EXISTS "Users can insert followups" ON public.nudge_followups;
DROP POLICY IF EXISTS "Users can update their followups" ON public.nudge_followups;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Users can view their followups"
  ON public.nudge_followups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert followups"
  ON public.nudge_followups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their followups"
  ON public.nudge_followups FOR UPDATE
  USING (auth.uid() = user_id);
