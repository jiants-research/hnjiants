import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { Clock, Mail, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { GmailMessage } from '@/hooks/useGmail';
import { parseFrom } from '@/hooks/useGmail';

interface GmailCardProps {
  email: GmailMessage;
  index: number;
  onDismiss: () => void;
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
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);

export const GmailCard = ({ email, index, onDismiss }: GmailCardProps) => {
  const { name, email: senderEmail } = parseFrom(email.from);
  let timeAgo = '';
  try {
    timeAgo = formatDistanceToNow(new Date(email.date), { addSuffix: true });
  } catch {
    timeAgo = email.date;
  }

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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            backgroundColor: getAvatarColor(name),
            color: 'hsl(0, 0%, 2%)',
          }}
        >
          {getInitials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-[15px] truncate">
            {name}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{senderEmail}</span>
          </div>
        </div>
      </div>

      {/* Subject */}
      <div className="text-sm font-medium text-foreground">
        {email.subject || '(no subject)'}
      </div>

      {/* Snippet */}
      <div className="bg-secondary/60 rounded-xl p-3.5 border border-border/50">
        <p className="text-sm text-foreground/80 leading-relaxed font-mono line-clamp-3">
          {email.snippet}
        </p>
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 shrink-0 text-primary" />
        <span className="text-sm font-medium font-mono text-primary">{timeAgo}</span>
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
      </div>
    </motion.div>
  );
};
