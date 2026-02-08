import { motion } from 'framer-motion';
import { AlertTriangle, Calendar, Clock, Flame, Send, User, X, MessageSquareQuote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import type { AnalyzedMessage, UrgencyLevel } from '@/hooks/useNudgeAnalysis';
import { CreateTaskButton } from '@/components/CreateTaskButton';

interface AIActionCardProps {
  item: AnalyzedMessage;
  index: number;
  onDismiss: () => void;
  onSendNudge: (text: string) => void;
  isSending?: boolean;
}

const urgencyConfig: Record<UrgencyLevel, { label: string; className: string; borderClass: string; icon: React.ReactNode }> = {
  critical: {
    label: 'Critical',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
    borderClass: 'border-destructive/40',
    icon: <Flame className="w-3 h-3" />,
  },
  high: {
    label: 'High',
    className: 'bg-accent/15 text-accent border-accent/30',
    borderClass: 'border-accent/40',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  medium: {
    label: 'Medium',
    className: 'bg-primary/10 text-primary border-primary/20',
    borderClass: 'border-border',
    icon: <Clock className="w-3 h-3" />,
  },
  low: {
    label: 'Low',
    className: 'bg-secondary text-muted-foreground border-border',
    borderClass: 'border-border',
    icon: <Clock className="w-3 h-3" />,
  },
};

export const AIActionCard = ({ item, index, onDismiss, onSendNudge, isSending }: AIActionCardProps) => {
  const [nudgeText, setNudgeText] = useState(item.ai_nudge_draft || '');
  const urgency = urgencyConfig[item.urgency] || urgencyConfig.medium;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -200, scale: 0.95 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`bg-card border rounded-2xl p-5 space-y-3 ${urgency.borderClass}`}
    >
      {/* Top row: Urgency badge + sent status */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${urgency.className}`}>
          {urgency.icon}
          {urgency.label}
        </div>
        {item.nudge_sent && (
          <span className="text-[11px] text-muted-foreground bg-secondary px-2 py-1 rounded-full">
            Nudge sent
          </span>
        )}
      </div>

      {/* Task Summary */}
      {item.task_summary && (
        <p className="text-sm font-semibold text-foreground leading-snug">{item.task_summary}</p>
      )}

      {/* Trigger message — the specific quote the CEO needs to see */}
      {item.trigger_message && (
        <div className="flex gap-2 items-start bg-secondary/60 rounded-xl px-3 py-2.5 border border-border">
          <MessageSquareQuote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-3">
            "{item.trigger_message}"
          </p>
        </div>
      )}

      {/* Metadata: Owner + Deadline */}
      <div className="flex flex-wrap gap-3">
        {item.assignee && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <User className="w-3.5 h-3.5 text-primary" />
            <span>{item.assignee}</span>
          </div>
        )}
        {item.deadline && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <span>{item.deadline}</span>
          </div>
        )}
      </div>

      {/* Draft Nudge */}
      {!item.nudge_sent && (
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            Draft Nudge
          </label>
          <Textarea
            value={nudgeText}
            onChange={(e) => setNudgeText(e.target.value)}
            className="bg-input border-border text-foreground text-sm resize-none min-h-[60px] focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
            rows={2}
          />
        </div>
      )}

      {/* Actions */}
      {!item.nudge_sent && (
        <div className="flex gap-3 pt-1">
          <Button
            variant="ghost"
            className="flex-1 h-12 text-muted-foreground hover:text-foreground hover:bg-secondary/80 rounded-xl transition-all active:scale-[0.97]"
            onClick={onDismiss}
          >
            <X className="w-4 h-4 mr-2" />
            Dismiss
          </Button>
          <Button
            className="flex-1 h-12 rounded-xl font-semibold glow-primary transition-all active:scale-[0.97]"
            onClick={() => onSendNudge(nudgeText)}
            disabled={isSending || !nudgeText}
          >
            <Send className="w-4 h-4 mr-2" />
            {isSending ? 'Sending…' : 'Send Nudge'}
          </Button>
        </div>
      )}
    </motion.div>
  );
};
