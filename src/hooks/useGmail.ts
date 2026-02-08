import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GmailMessage {
  id: string;
  thread_id: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  label_ids: string[];
}

export const useGmailMessages = (googleAccessToken: string | null, query?: string) => {
  return useQuery({
    queryKey: ['gmail-messages', googleAccessToken, query],
    queryFn: async () => {
      if (!googleAccessToken) return [];

      const { data, error } = await supabase.functions.invoke('fetch-gmail', {
        body: { google_access_token: googleAccessToken, max_results: 20, query: query || '' },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data.emails as GmailMessage[];
    },
    enabled: !!googleAccessToken,
  });
};

/** Parse "Name <email@example.com>" into { name, email } */
export const parseFrom = (from: string) => {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, '').trim(), email: match[2] };
  }
  return { name: from, email: from };
};
