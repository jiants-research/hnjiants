import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SlackMessage } from '@/hooks/useSlack';

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

const URGENCY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface AnalyzedMessage {
  id: string;
  slack_message_ts: string;
  channel_id: string;
  is_actionable: boolean;
  task_summary: string | null;
  deadline: string | null;
  assignee: string | null;
  ai_nudge_draft: string | null;
  nudge_sent: boolean;
  nudge_sent_at: string | null;
  created_at: string;
  urgency: UrgencyLevel;
  trigger_message: string | null;
}

export interface NudgeFollowup {
  id: string;
  channel_id: string;
  slack_message_ts: string;
  task_summary: string;
  assignee: string | null;
  followup_at: string;
  status: string;
  urgency: UrgencyLevel;
  slack_processed_messages?: {
    employee_name: string | null;
    ai_nudge_draft: string | null;
    original_message: string | null;
  };
}

export const useAnalyzeSlackMessages = (channelId: string | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messages: SlackMessage[]) => {
      if (!channelId || messages.length === 0) return { results: [], new_count: 0 };

      const { data, error } = await supabase.functions.invoke('analyze-slack-messages', {
        body: { messages, channel_id: channelId },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { results: AnalyzedMessage[]; new_count: number; actionable_count: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzed-messages', channelId] });
      queryClient.invalidateQueries({ queryKey: ['nudge-followups'] });
    },
  });
};

export const useAnalyzedMessages = (channelId: string | null) => {
  return useQuery({
    queryKey: ['analyzed-messages', channelId],
    queryFn: async () => {
      if (!channelId) return [];

      const { data, error } = await supabase
        .from('slack_processed_messages')
        .select('*')
        .eq('channel_id', channelId)
        .eq('is_actionable', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Sort by urgency (critical first) then by created_at
      const messages = (data || []) as AnalyzedMessage[];
      return messages.sort((a, b) => {
        const urgencyDiff = (URGENCY_ORDER[a.urgency] ?? 2) - (URGENCY_ORDER[b.urgency] ?? 2);
        if (urgencyDiff !== 0) return urgencyDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
    enabled: !!channelId,
  });
};

export const useNudgeFollowups = () => {
  return useQuery({
    queryKey: ['nudge-followups'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-followups', {
        body: { action: 'list' },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return (data.followups || []) as NudgeFollowup[];
    },
    refetchInterval: 5 * 60 * 1000,
  });
};

export const useResolveFollowup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (followupId: string) => {
      const { data, error } = await supabase.functions.invoke('check-followups', {
        body: { action: 'resolve', followup_id: followupId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nudge-followups'] });
    },
  });
};

export const useSendReminder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (followupId: string) => {
      const { data, error } = await supabase.functions.invoke('check-followups', {
        body: { action: 'send_reminder', followup_id: followupId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nudge-followups'] });
    },
  });
};
