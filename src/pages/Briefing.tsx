import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSlackMessages, sendSlackNudge, SlackMessage } from '@/hooks/useSlack';
import { ChannelSelector } from '@/components/ChannelSelector';
import { SlackMessageCard } from '@/components/SlackMessageCard';
import { toast } from 'sonner';
import { Activity, Loader2, MessageSquare } from 'lucide-react';

const Briefing = () => {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [dismissedTs, setDismissedTs] = useState<Set<string>>(new Set());

  const { data: messages = [], isLoading } = useSlackMessages(selectedChannel);

  const visibleMessages = messages.filter((m) => !dismissedTs.has(m.timestamp));

  const handleDismiss = (ts: string) => {
    setDismissedTs((prev) => new Set(prev).add(ts));
    toast('Message dismissed', { description: 'Removed from your briefing.' });
  };

  const handleSendNudge = async (msg: SlackMessage, nudgeText: string) => {
    try {
      await sendSlackNudge(msg.channel, nudgeText, msg.timestamp);
      setDismissedTs((prev) => new Set(prev).add(msg.timestamp));
      toast.success('Nudge sent!', { description: `Reply sent to #${msg.channel} thread.` });
    } catch (err: any) {
      toast.error('Failed to send nudge', { description: err.message });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Briefing
        </h1>
        <p className="text-sm text-muted-foreground">
          Fetch live messages from Slack
        </p>
      </div>

      {/* Channel Selector */}
      <ChannelSelector
        selectedChannel={selectedChannel}
        onSelect={setSelectedChannel}
      />

      {/* Messages */}
      {selectedChannel && (
        <>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {visibleMessages.length} message{visibleMessages.length !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {visibleMessages.map((msg, i) => (
                  <SlackMessageCard
                    key={msg.timestamp}
                    message={msg}
                    index={i}
                    onDismiss={() => handleDismiss(msg.timestamp)}
                    onSendNudge={(nudgeText) => handleSendNudge(msg, nudgeText)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && visibleMessages.length === 0 && (
            <div className="text-center py-20 space-y-3 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <MessageSquare className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium">No messages</p>
              <p className="text-muted-foreground text-sm">
                This channel has no recent messages.
              </p>
            </div>
          )}
        </>
      )}

      {/* No channel selected */}
      {!selectedChannel && (
        <div className="text-center py-20 space-y-3 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Activity className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium">Select a channel</p>
          <p className="text-muted-foreground text-sm">
            Pick a Slack channel to view messages and send nudges.
          </p>
        </div>
      )}
    </div>
  );
};

export default Briefing;
