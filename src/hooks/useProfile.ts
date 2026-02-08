import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  default_channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as UserProfile | null;
    },
    enabled: !!user,
  });

  // Sync avatar_url from Google OAuth metadata on login
  useEffect(() => {
    if (!user || !profileQuery.data) return;

    const metaAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
    const profile = profileQuery.data;

    const updates: Record<string, string> = {};
    if (metaAvatar && metaAvatar !== profile.avatar_url) {
      updates.avatar_url = metaAvatar;
    }
    if (metaName && metaName !== profile.full_name) {
      updates.full_name = metaName;
    }

    if (Object.keys(updates).length > 0) {
      supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
        });
    }
  }, [user, profileQuery.data, queryClient]);

  return profileQuery;
};

export const useUpdateProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Pick<UserProfile, 'full_name' | 'default_channel_id'>>) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['default-channel'] });
    },
  });
};

export const getInitials = (name: string | null | undefined, email: string | null | undefined): string => {
  if (name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
  if (email) {
    return email[0].toUpperCase();
  }
  return '?';
};
