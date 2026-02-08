import { motion } from 'framer-motion';
import { Brain, Calendar, Clock, Send, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import type { AnalyzedMessage } from '@/hooks/useNudgeAnalysis';

interface AIActionCardProps {
  item: AnalyzedMessage;
  index: number;
  onDismiss: () => void;
  onSendNudge: (text: string) => void;
  isSending?: boolean;
}

export const AIActionCard = ({ item, index, onDismiss, onSendNudge, isSending }: AIActionCardProps) => {
  const [nudgeText, setNudgeText] = useState(item.ai_nudge_draft || '');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -200, scale: 0.95 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-card border border-border rounded-2xl p-5 space-y-4"
    >
      {/* AI Badge */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wider">
          <Brain className="w-3 h-3" />
          AI Detected Task
        </div>
        {item.nudge_sent && (
          <span className="text-[11px] text-muted-foreground bg-secondary px-2 py-1 rounded-full">
            Nudge sent
          </span>
        )}
      </div>

      {/* Task Summary */}
      {item.task_summary && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{item.task_summary}</p>
        </div>
      )}

      {/* Metadata: Assignee + Deadline */}
      <div className="flex flex-wrap gap-3">
        {item.assignee && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="w-3.5 h-3.5 text-primary" />
            <span>{item.assignee}</span>
          </div>
        )}
        {item.deadline && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span>{item.deadline}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span>Follow-up in 2 days</span>
        </div>
      </div>

      {/* Draft Nudge */}
      {!item.nudge_sent && (
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
            AI-Drafted Nudge
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
