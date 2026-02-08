import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { Clock, Hash, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SlackMessage } from '@/hooks/useSlack';

interface SlackMessageCardProps {
  message: SlackMessage;
  index: number;
  onDismiss: () => void;
  onSendNudge: (text: string) => void;
}

const avatarColors = [
  'hsl(142, 71%, 45%)',
  'hsl(210, 78%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(25, 95%, 53%)',
  'hsl(340, 72%, 55%)',
];

const getAvatarColor = (name: string) => {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatarColors[hash % avatarColors.length];
};

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export const SlackMessageCard = ({
  message,
  index,
  onDismiss,
  onSendNudge,
}: SlackMessageCardProps) => {
  const [draftMessage, setDraftMessage] = useState(
    `Hey ${message.employee_name.split(' ')[0]}, just following up on this — any updates?`
  );

  const msgDate = new Date(parseFloat(message.timestamp) * 1000);
  const timeAgo = formatDistanceToNow(msgDate, { addSuffix: true });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -200, scale: 0.95 }}
      transition={{
        duration: 0.35,
        delay: index * 0.06,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="bg-card border border-border rounded-2xl p-5 space-y-4"
    >
      {/* Header: Avatar + Name + Channel */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            backgroundColor: getAvatarColor(message.employee_name),
            color: 'hsl(0, 0%, 2%)',
          }}
        >
          {getInitials(message.employee_name)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-[15px] truncate">
            {message.employee_name}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hash className="w-3 h-3 shrink-0" />
            <span className="truncate">{message.channel}</span>
            <span className="opacity-40">·</span>
            <span>Slack</span>
          </div>
        </div>
      </div>

      {/* Original message snippet */}
      <div className="bg-secondary/60 rounded-xl p-3.5 border border-border/50">
        <p className="text-sm text-foreground/80 leading-relaxed font-mono">
          &ldquo;{message.original_message}&rdquo;
        </p>
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 shrink-0 text-primary" />
        <span className="text-sm font-medium font-mono text-primary">
          {timeAgo}
        </span>
      </div>

      {/* Draft Reply */}
      <div className="space-y-2">
        <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">
          Draft Reply
        </label>
        <Textarea
          value={draftMessage}
          onChange={(e) => setDraftMessage(e.target.value)}
          className="bg-input border-border text-foreground text-sm resize-none min-h-[60px] focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-all"
          rows={2}
        />
      </div>

      {/* Actions */}
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
          onClick={() => onSendNudge(draftMessage)}
        >
          <Send className="w-4 h-4 mr-2" />
          Send Nudge
        </Button>
      </div>
    </motion.div>
  );
};
