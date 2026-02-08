import { motion } from 'framer-motion';
import { Bell, Check, Send } from 'lucide-react';
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

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {followups.length} follow-up{followups.length !== 1 ? 's' : ''} due
        </span>
      </div>

      {followups.map((f) => (
        <div
          key={f.id}
          className="bg-card border border-border rounded-xl p-3 space-y-2"
        >
          <p className="text-sm text-foreground font-medium">{f.task_summary}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {f.assignee && <span>Assigned to {f.assignee}</span>}
            <span>·</span>
            <span>Due {formatDistanceToNow(new Date(f.followup_at), { addSuffix: true })}</span>
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
      ))}
    </motion.div>
  );
};
