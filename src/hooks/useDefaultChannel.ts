import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const useDefaultChannel = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['default-channel', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('default_channel_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data?.default_channel_id || null;
    },
    enabled: !!user?.id,
  });

  return query;
};

export const useSetDefaultChannel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string | null) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({ default_channel_id: channelId } as any)
        .eq('user_id', user.id);

      if (error) throw error;
      return channelId;
    },
    onSuccess: (channelId) => {
      queryClient.setQueryData(['default-channel', user?.id], channelId);
    },
  });
};
