import { motion } from 'framer-motion';
import { AlertTriangle, Bell, Check, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NudgeFollowup } from '@/hooks/useNudgeAnalysis';
import { formatDistanceToNow } from 'date-fns';

interface FollowupBannerProps {
  followups: NudgeFollowup[];
  onResolve: (id: string) => void;
  onSendReminder: (id: string) => void;
  isResolving?: boolean;
  isSending?: boolean;
}

export const FollowupBanner = ({
  followups,
  onResolve,
  onSendReminder,
  isResolving,
  isSending,
}: FollowupBannerProps) => {
  if (followups.length === 0) return null;

  const overdueFollowups = followups.filter((f) => new Date(f.followup_at) <= new Date());
  const hasOverdue = overdueFollowups.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 space-y-3 border ${
        hasOverdue
          ? 'bg-destructive/10 border-destructive/30'
          : 'bg-primary/5 border-primary/20'
      }`}
    >
      <div className="flex items-center gap-2">
        {hasOverdue ? (
          <AlertTriangle className="w-4 h-4 text-destructive" />
        ) : (
          <Bell className="w-4 h-4 text-primary" />
        )}
        <span className={`text-sm font-semibold ${hasOverdue ? 'text-destructive' : 'text-foreground'}`}>
          {hasOverdue
            ? `${overdueFollowups.length} overdue follow-up${overdueFollowups.length !== 1 ? 's' : ''}`
            : `${followups.length} follow-up${followups.length !== 1 ? 's' : ''} due`}
        </span>
      </div>

      {followups.map((f) => {
        const isOverdue = new Date(f.followup_at) <= new Date();
        return (
          <div
            key={f.id}
            className={`rounded-xl p-3 space-y-2 border ${
              isOverdue
                ? 'bg-destructive/5 border-destructive/20'
                : 'bg-card border-border'
            }`}
          >
            <p className="text-sm text-foreground font-medium">{f.task_summary}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {f.assignee && <span className="font-medium text-foreground">{f.assignee}</span>}
              {f.assignee && <span>·</span>}
              <span className={isOverdue ? 'text-destructive font-semibold' : ''}>
                {isOverdue ? 'Overdue — ' : ''}
                Due {formatDistanceToNow(new Date(f.followup_at), { addSuffix: true })}
              </span>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-8 rounded-lg"
                onClick={() => onResolve(f.id)}
                disabled={isResolving}
              >
                <Check className="w-3 h-3 mr-1" />
                Resolved
              </Button>
              <Button
                size="sm"
                className="text-xs h-8 rounded-lg"
                onClick={() => onSendReminder(f.id)}
                disabled={isSending}
              >
                <Send className="w-3 h-3 mr-1" />
                Send Reminder
              </Button>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
};
