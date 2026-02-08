import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Integration {
  id: string;
  user_id: string;
  provider: 'linear';
  config: Record<string, string>;
  api_token: string | null;
  created_at: string;
  updated_at: string;
}

export const useIntegration = () => {
  return useQuery({
    queryKey: ['integration'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', 'linear')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Integration | null;
    },
  });
};

export const useSaveIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      config: Record<string, string>;
      api_token: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('integrations')
        .upsert(
          {
            user_id: user.id,
            provider: 'linear',
            config: params.config,
            api_token: params.api_token,
          },
          { onConflict: 'user_id,provider' }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration'] });
    },
  });
};

export const useDeleteIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (integrationId: string) => {
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('id', integrationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration'] });
    },
  });
};

export const useTestConnection = () => {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-external-task', {
        body: { action: 'test' },
      });
      if (error) throw new Error(error.message);
      return data as { success: boolean; error?: string; user?: string; message?: string };
    },
  });
};

export const useCreateExternalTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      description?: string;
      assignee?: string;
      urgency?: string;
      deadline?: string;
      source_type: 'processed_message' | 'followup';
      source_id: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-external-task', {
        body: params,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; external_task_id: string; external_task_url: string | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyzed-messages'] });
      queryClient.invalidateQueries({ queryKey: ['nudge-followups'] });
      queryClient.invalidateQueries({ queryKey: ['all-followups'] });
    },
  });
};
