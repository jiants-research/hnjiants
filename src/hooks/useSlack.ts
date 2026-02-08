import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
}

export interface SlackMessage {
  slack_user_id: string;
  employee_name: string;
  original_message: string;
  timestamp: string;
  channel: string;
}

export const useSlackChannels = () => {
  return useQuery({
    queryKey: ['slack-channels'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-slack-channels', {
        body: {},
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data.channels as SlackChannel[];
    },
  });
};

export const useSlackMessages = (channelId: string | null) => {
  return useQuery({
    queryKey: ['slack-messages', channelId],
    queryFn: async () => {
      if (!channelId) return [];

      const { data, error } = await supabase.functions.invoke('fetch-slack-messages', {
        body: { channel_id: channelId, limit: 30 },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data.messages as SlackMessage[];
    },
    enabled: !!channelId,
  });
};

export const sendSlackNudge = async (channel: string, text: string, threadTs?: string) => {
  const { data, error } = await supabase.functions.invoke('send-slack-message', {
    body: { channel, text, thread_ts: threadTs },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
};
