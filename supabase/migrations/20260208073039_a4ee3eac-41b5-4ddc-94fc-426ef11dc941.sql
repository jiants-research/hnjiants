
-- Create open_loops table for storing detected promises/commitments
CREATE TABLE public.open_loops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  original_message TEXT NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('overdue', 'due_soon', 'on_track')),
  ai_draft_response TEXT NOT NULL,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  nudge_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (public read for now since auth is UI-only)
ALTER TABLE public.open_loops ENABLE ROW LEVEL SECURITY;

-- Allow public read access (no auth yet — UI-only demo)
CREATE POLICY "Allow public read access to open_loops"
  ON public.open_loops
  FOR SELECT
  USING (true);

-- Allow public insert/update for demo purposes
CREATE POLICY "Allow public insert to open_loops"
  ON public.open_loops
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to open_loops"
  ON public.open_loops
  FOR UPDATE
  USING (true);

-- Seed 5 realistic agency work examples
INSERT INTO public.open_loops (employee_name, channel, original_message, due_date, status, ai_draft_response) VALUES
  ('Sarah Chen', 'design', 'I''ll have the design mockups ready by Friday 5 PM', now() - interval '4 hours', 'overdue', 'Hey Sarah, gentle bump on the design mockups. Are they ready for review?'),
  ('Marcus Johnson', 'sales', 'Client proposal will be sent out by end of day', now() - interval '18 hours', 'overdue', 'Hey Marcus, checking in on the client proposal — what''s the latest?'),
  ('Priya Patel', 'engineering', 'Bug fix for the checkout flow will be deployed by noon today', now() - interval '2 hours', 'overdue', 'Hey Priya, the checkout bug fix was due at noon — is it deployed yet?'),
  ('Alex Rivera', 'ops', 'I''ll schedule the team retrospective by tomorrow morning', now() + interval '45 minutes', 'due_soon', 'Hey Alex, just a heads up — the retro scheduling is coming up soon. All set?'),
  ('Jordan Kim', 'finance', 'The Q4 financial report will be on your desk by Wednesday', now() - interval '1 day', 'overdue', 'Hey Jordan, the Q4 report was due yesterday — can you send it over?');
