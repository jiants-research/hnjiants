-- Add default_channel_id column to profiles for storing user's preferred default Slack channel
ALTER TABLE public.profiles ADD COLUMN default_channel_id text DEFAULT NULL;