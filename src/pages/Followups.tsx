import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useNudgeFollowups,
  useResolveFollowup,
  useSendReminder,
  useAnalyzedMessages,
} from '@/hooks/useNudgeAnalysis';
import { toast } from 'sonner';
import { Bell, Check, Clock, Send, Brain, CheckCircle, AlertCircle } from 'lucide-react';
import { CreateTaskButton } from '@/components/CreateTaskButton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDistanceToNow, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { NudgeFollowup } from '@/hooks/useNudgeAnalysis';

const Followups = () => {
  const { data: pendingFollowups = [], isLoading: pendingLoading } = useNudgeFollowups();
  const resolveFollowup = useResolveFollowup();
  const sendReminder = useSendReminder();

  // All followups (including sent/resolved)
  const { data: allFollowups = [], isLoading: allLoading } = useQuery({
    queryKey: ['all-followups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nudge_followups')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as NudgeFollowup[];
    },
  });

  const sentFollowups = allFollowups.filter((f) => f.status === 'sent');
  const resolvedFollowups = allFollowups.filter((f) => f.status === 'resolved');
  const upcomingFollowups = allFollowups.filter(
    (f) => f.status === 'pending' && new Date(f.followup_at) > new Date()
  );

  const handleResolve = (id: string) => {
    resolveFollowup.mutate(id, {
      onSuccess: () => toast.success('Marked as resolved'),
      onError: (err) => toast.error('Failed', { description: err.message }),
    });
  };

  const handleSendReminder = (id: string) => {
    sendReminder.mutate(id, {
      onSuccess: () => toast.success('Reminder sent via Slack!'),
      onError: (err) => toast.error('Failed to send', { description: err.message }),
    });
  };

  const isLoading = pendingLoading || allLoading;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          Track AI-scheduled reminders &amp; task follow-ups
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Due Now"
          count={pendingFollowups.length}
          icon={<AlertCircle className="w-4 h-4" />}
          color="text-destructive"
        />
        <StatCard
          label="Upcoming"
          count={upcomingFollowups.length}
          icon={<Clock className="w-4 h-4" />}
          color="text-primary"
        />
        <StatCard
          label="Resolved"
          count={resolvedFollowups.length}
          icon={<CheckCircle className="w-4 h-4" />}
          color="text-green-500"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="due" className="w-full">
        <TabsList className="w-full bg-secondary rounded-xl p-1 h-auto">
          <TabsTrigger
            value="due"
            className="flex-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg py-2.5 text-sm font-medium gap-2"
          >
            <Bell className="w-4 h-4" />
            Due
            {pendingFollowups.length > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {pendingFollowups.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="upcoming"
            className="flex-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg py-2.5 text-sm font-medium gap-2"
          >
            <Clock className="w-4 h-4" />
            Upcoming
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="flex-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg py-2.5 text-sm font-medium gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Due Tab */}
        <TabsContent value="due" className="space-y-4 mt-4">
          {isLoading ? (
            <LoadingState />
          ) : pendingFollowups.length === 0 ? (
            <EmptyState
              icon={<Bell className="w-7 h-7 text-primary" />}
              title="No due follow-ups"
              subtitle="All caught up! Follow-ups will appear here when they're due."
            />
          ) : (
            <AnimatePresence mode="popLayout">
              {pendingFollowups.map((f, i) => (
                <FollowupCard
                  key={f.id}
                  followup={f}
                  index={i}
                  onResolve={() => handleResolve(f.id)}
                  onSendReminder={() => handleSendReminder(f.id)}
                  isResolving={resolveFollowup.isPending}
                  isSending={sendReminder.isPending}
                  showActions
                />
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        {/* Upcoming Tab */}
        <TabsContent value="upcoming" className="space-y-4 mt-4">
          {isLoading ? (
            <LoadingState />
          ) : upcomingFollowups.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-7 h-7 text-primary" />}
              title="No upcoming follow-ups"
              subtitle="New follow-ups are created when AI detects actionable tasks."
            />
          ) : (
            <AnimatePresence mode="popLayout">
              {upcomingFollowups.map((f, i) => (
                <FollowupCard
                  key={f.id}
                  followup={f}
                  index={i}
                  onResolve={() => handleResolve(f.id)}
                  onSendReminder={() => handleSendReminder(f.id)}
                  isResolving={resolveFollowup.isPending}
                  isSending={sendReminder.isPending}
                  showActions
                />
              ))}
            </AnimatePresence>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {isLoading ? (
            <LoadingState />
          ) : sentFollowups.length === 0 && resolvedFollowups.length === 0 ? (
            <EmptyState
              icon={<CheckCircle className="w-7 h-7 text-primary" />}
              title="No history yet"
              subtitle="Sent reminders and resolved tasks will appear here."
            />
          ) : (
            <AnimatePresence mode="popLayout">
              {[...sentFollowups, ...resolvedFollowups].map((f, i) => (
                <FollowupCard
                  key={f.id}
                  followup={f}
                  index={i}
                  onResolve={() => {}}
                  onSendReminder={() => {}}
                  showActions={false}
                />
              ))}
            </AnimatePresence>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const StatCard = ({
  label,
  count,
  icon,
  color,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: string;
}) => (
  <div className="bg-card border border-border rounded-xl p-3 text-center space-y-1">
    <div className={`flex items-center justify-center ${color}`}>{icon}</div>
    <p className="text-xl font-bold text-foreground">{count}</p>
    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
  </div>
);

const FollowupCard = ({
  followup,
  index,
  onResolve,
  onSendReminder,
  isResolving,
  isSending,
  showActions,
}: {
  followup: NudgeFollowup;
  index: number;
  onResolve: () => void;
  onSendReminder: () => void;
  isResolving?: boolean;
  isSending?: boolean;
  showActions: boolean;
}) => {
  const statusConfig = {
    pending: { label: 'Pending', className: 'bg-primary/10 text-primary' },
    sent: { label: 'Reminder Sent', className: 'bg-amber-500/10 text-amber-500' },
    resolved: { label: 'Resolved', className: 'bg-green-500/10 text-green-500' },
  };

  const status = statusConfig[followup.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -200, scale: 0.95 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-card border border-border rounded-2xl p-5 space-y-3"
    >
      {/* Status Badge + Due Time */}
      {(() => {
        const dueDate = new Date(followup.followup_at);
        const now = new Date();
        const isOverdue = dueDate <= now;
        const diffMs = dueDate.getTime() - now.getTime();
        const hoursUntilDue = diffMs / (1000 * 60 * 60);

        let dueBadge: { label: string; className: string };
        if (followup.status === 'resolved') {
          dueBadge = { label: 'Resolved', className: 'bg-green-500/10 text-green-500' };
        } else if (followup.status === 'sent') {
          dueBadge = { label: 'Reminder Sent', className: 'bg-amber-500/10 text-amber-500' };
        } else if (isOverdue) {
          dueBadge = { label: `Overdue · ${formatDistanceToNow(dueDate)} ago`, className: 'bg-destructive/10 text-destructive' };
        } else if (hoursUntilDue <= 4) {
          dueBadge = { label: `Due in ${formatDistanceToNow(dueDate)}`, className: 'bg-destructive/10 text-destructive' };
        } else if (hoursUntilDue <= 24) {
          dueBadge = { label: `Due in ${formatDistanceToNow(dueDate)}`, className: 'bg-amber-500/10 text-amber-500' };
        } else {
          dueBadge = { label: `Due in ${formatDistanceToNow(dueDate)}`, className: 'bg-primary/10 text-primary' };
        }

        return (
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${status.className}`}>
              {status.label}
            </span>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${dueBadge.className}`}>
              {isOverdue && followup.status === 'pending' ? (
                <AlertCircle className="w-3 h-3" />
              ) : (
                <Clock className="w-3 h-3" />
              )}
              {dueBadge.label}
            </span>
          </div>
        );
      })()}

      {/* Task */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-semibold text-foreground">{followup.task_summary}</p>
        </div>
        {followup.assignee && (
          <p className="text-xs text-muted-foreground ml-6">Assigned to {followup.assignee}</p>
        )}
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>{format(new Date(followup.followup_at), 'MMM d, yyyy · h:mm a')}</span>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex gap-3 pt-1">
          <Button
            variant="ghost"
            className="flex-1 h-11 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-xl transition-all active:scale-[0.97]"
            onClick={onResolve}
            disabled={isResolving}
          >
            <Check className="w-4 h-4 mr-2" />
            Resolved
          </Button>
          <Button
            className="flex-1 h-11 rounded-xl font-semibold glow-primary transition-all active:scale-[0.97]"
            onClick={onSendReminder}
            disabled={isSending}
          >
            <Send className="w-4 h-4 mr-2" />
            Send Reminder
          </Button>
        </div>
      )}
    </motion.div>
  );
};

const LoadingState = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const EmptyState = ({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) => (
  <div className="text-center py-20 space-y-3 animate-fade-in">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
      {icon}
    </div>
    <p className="text-foreground font-medium">{title}</p>
    <p className="text-muted-foreground text-sm">{subtitle}</p>
  </div>
);

export default Followups;
