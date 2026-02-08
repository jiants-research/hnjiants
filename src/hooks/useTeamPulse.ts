import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamMemberStats {
  name: string;
  open_loops: number;
  total_tasks: number;
  resolved_count: number;
  total_followups: number;
  reliability_score: number;
}

export const useTeamPulse = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['team-pulse', user?.id],
    queryFn: async (): Promise<TeamMemberStats[]> => {
      if (!user) return [];

      // Fetch all actionable processed messages for this user
      const { data: messages, error: msgError } = await supabase
        .from('slack_processed_messages')
        .select('assignee, is_actionable, nudge_sent')
        .eq('user_id', user.id)
        .eq('is_actionable', true);

      if (msgError) throw msgError;

      // Fetch all followups for this user
      const { data: followups, error: fuError } = await supabase
        .from('nudge_followups')
        .select('assignee, status')
        .eq('user_id', user.id);

      if (fuError) throw fuError;

      // Aggregate by assignee
      const statsMap = new Map<string, {
        total_tasks: number;
        open_loops: number;
        resolved: number;
        total_followups: number;
      }>();

      for (const msg of messages || []) {
        const name = msg.assignee || 'Unknown';
        const entry = statsMap.get(name) || { total_tasks: 0, open_loops: 0, resolved: 0, total_followups: 0 };
        entry.total_tasks++;
        if (!msg.nudge_sent) {
          entry.open_loops++;
        }
        statsMap.set(name, entry);
      }

      for (const fu of followups || []) {
        const name = fu.assignee || 'Unknown';
        const entry = statsMap.get(name) || { total_tasks: 0, open_loops: 0, resolved: 0, total_followups: 0 };
        entry.total_followups++;
        if (fu.status === 'resolved') {
          entry.resolved++;
        }
        statsMap.set(name, entry);
      }

      // Build result array
      const result: TeamMemberStats[] = [];
      for (const [name, stats] of statsMap) {
        const denominator = stats.total_tasks || 1;
        const reliability_score = Math.round((stats.resolved / denominator) * 100);
        result.push({
          name,
          open_loops: stats.open_loops,
          total_tasks: stats.total_tasks,
          resolved_count: stats.resolved,
          total_followups: stats.total_followups,
          reliability_score: Math.min(reliability_score, 100),
        });
      }

      // Sort by reliability descending
      result.sort((a, b) => b.reliability_score - a.reliability_score);
      return result;
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });
};
