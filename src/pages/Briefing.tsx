import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NudgeCard } from '@/components/NudgeCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Activity, Loader2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type OpenLoop = Tables<'open_loops'>;

const Briefing = () => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const { session } = useAuth();
  const queryClient = useQueryClient();

  // Seed demo data for new users
  useEffect(() => {
    if (!session?.access_token || seeded) return;

    const seedData = async () => {
      try {
        await supabase.functions.invoke('seed-demo-data', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        setSeeded(true);
        queryClient.invalidateQueries({ queryKey: ['open_loops'] });
      } catch {
        // Ignore seed errors
      }
    };
    seedData();
  }, [session?.access_token, seeded, queryClient]);

  const { data: loops = [], isLoading } = useQuery({
    queryKey: ['open_loops'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('open_loops')
        .select('*')
        .eq('dismissed', false)
        .eq('nudge_sent', false)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data as OpenLoop[];
    },
    enabled: !!session,
  });

  const visibleLoops = loops.filter((l) => !dismissedIds.has(l.id));

  const handleDismiss = async (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    toast('Loop dismissed', { description: 'Removed from your briefing.' });
    await supabase.from('open_loops').update({ dismissed: true }).eq('id', id);
  };

  const handleSendNudge = async (id: string, _message: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    toast.success('Nudge sent!', { description: 'Message delivered via Slack.' });
    await supabase.from('open_loops').update({ nudge_sent: true }).eq('id', id);
  };

  const overdueCount = visibleLoops.filter((l) => l.status === 'overdue').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Briefing
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {visibleLoops.length} open loop{visibleLoops.length !== 1 ? 's' : ''}
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-accent font-medium">
              <Activity className="w-3.5 h-3.5" />
              {overdueCount} overdue
            </span>
          )}
        </div>
      </div>

      {/* Card Feed */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {visibleLoops.map((loop, i) => (
            <NudgeCard
              key={loop.id}
              loop={loop}
              index={i}
              onDismiss={handleDismiss}
              onSendNudge={handleSendNudge}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {visibleLoops.length === 0 && (
        <div className="text-center py-20 space-y-3 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Activity className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium">All clear</p>
          <p className="text-muted-foreground text-sm">
            No open loops detected. Nice work.
          </p>
        </div>
      )}
    </div>
  );
};

export default Briefing;
