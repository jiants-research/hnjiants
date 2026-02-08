import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { NudgeCard } from '@/components/NudgeCard';
import { mockOpenLoops } from '@/data/mockData';
import { toast } from 'sonner';
import { Activity } from 'lucide-react';

const Briefing = () => {
  const [loops, setLoops] = useState(mockOpenLoops);

  const handleDismiss = (id: string) => {
    setLoops((prev) => prev.filter((l) => l.id !== id));
    toast('Loop dismissed', {
      description: 'Removed from your briefing.',
    });
  };

  const handleSendNudge = (id: string, _message: string) => {
    setLoops((prev) => prev.filter((l) => l.id !== id));
    toast.success('Nudge sent!', {
      description: 'Message delivered via Slack.',
    });
  };

  const overdueCount = loops.filter((l) => l.status === 'overdue').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Briefing
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {loops.length} open loop{loops.length !== 1 ? 's' : ''}
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
          {loops.map((loop, i) => (
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
      {loops.length === 0 && (
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
