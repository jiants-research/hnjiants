import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSlackMessages, sendSlackNudge } from '@/hooks/useSlack';
import { useGmailMessages } from '@/hooks/useGmail';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAnalyzeSlackMessages,
  useAnalyzedMessages,
  useNudgeFollowups,
  useResolveFollowup,
  useSendReminder,
} from '@/hooks/useNudgeAnalysis';
import { ChannelSelector } from '@/components/ChannelSelector';
import { AIActionCard } from '@/components/AIActionCard';
import { FollowupBanner } from '@/components/FollowupBanner';
import { SlackMessageCard } from '@/components/SlackMessageCard';
import { GmailCard } from '@/components/GmailCard';
import { toast } from 'sonner';
import { Activity, Brain, Loader2, MessageSquare, Mail, Hash } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

const Briefing = () => {
  const { providerToken } = useAuth();
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [dismissedGmailIds, setDismissedGmailIds] = useState<Set<string>>(new Set());
  const [dismissedAnalyzedIds, setDismissedAnalyzedIds] = useState<Set<string>>(new Set());

  const { data: slackMessages = [], isLoading: slackLoading } = useSlackMessages(selectedChannel);
  const { data: gmailMessages = [], isLoading: gmailLoading } = useGmailMessages(providerToken);

  // AI analysis pipeline
  const analyzeMutation = useAnalyzeSlackMessages(selectedChannel);
  const { data: analyzedMessages = [] } = useAnalyzedMessages(selectedChannel);
  const { data: followups = [] } = useNudgeFollowups();
  const resolveFollowup = useResolveFollowup();
  const sendReminder = useSendReminder();

  // Auto-analyze when new Slack messages arrive
  useEffect(() => {
    if (slackMessages.length > 0 && selectedChannel && !analyzeMutation.isPending) {
      analyzeMutation.mutate(slackMessages);
    }
    // Only trigger on new messages, not on mutation state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slackMessages, selectedChannel]);

  const visibleAnalyzed = analyzedMessages.filter(
    (m) => !dismissedAnalyzedIds.has(m.id) && !m.nudge_sent
  );
  const visibleGmail = gmailMessages.filter((m) => !dismissedGmailIds.has(m.id));

  const handleDismissAnalyzed = (id: string) => {
    setDismissedAnalyzedIds((prev) => new Set(prev).add(id));
    toast('Task dismissed');
  };

  const handleSendAINudge = async (item: typeof analyzedMessages[0], nudgeText: string) => {
    try {
      await sendSlackNudge(item.channel_id, nudgeText, item.slack_message_ts);
      toast.success('AI nudge sent!', { description: 'Reply sent as thread.' });
      // Refresh data
      analyzeMutation.mutate(slackMessages);
    } catch (err: any) {
      toast.error('Failed to send nudge', { description: err.message });
    }
  };

  const handleDismissSlack = (ts: string) => {
    setDismissedSlackTs((prev) => new Set(prev).add(ts));
    toast('Message dismissed');
  };

  const handleSendNudge = async (msg: SlackMessage, nudgeText: string) => {
    try {
      await sendSlackNudge(msg.channel, nudgeText, msg.timestamp);
      setDismissedSlackTs((prev) => new Set(prev).add(msg.timestamp));
      toast.success('Nudge sent!', { description: 'Reply sent to thread.' });
    } catch (err: any) {
      toast.error('Failed to send nudge', { description: err.message });
    }
  };

  const handleDismissGmail = (id: string) => {
    setDismissedGmailIds((prev) => new Set(prev).add(id));
    toast('Email dismissed');
  };

  const handleResolveFollowup = (id: string) => {
    resolveFollowup.mutate(id, {
      onSuccess: () => toast.success('Marked as resolved'),
      onError: (err) => toast.error('Failed', { description: err.message }),
    });
  };

  const handleSendReminder = (id: string) => {
    sendReminder.mutate(id, {
      onSuccess: () => toast.success('Reminder sent!'),
      onError: (err) => toast.error('Failed', { description: err.message }),
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Briefing</h1>
        <p className="text-sm text-muted-foreground">
          AI-powered task detection &amp; nudges from Slack &amp; Gmail
        </p>
      </div>

      {/* Follow-up banner */}
      <FollowupBanner
        followups={followups}
        onResolve={handleResolveFollowup}
        onSendReminder={handleSendReminder}
        isResolving={resolveFollowup.isPending}
        isSending={sendReminder.isPending}
      />

      {/* Tabs */}
      <Tabs defaultValue="slack" className="w-full">
        <TabsList className="w-full bg-secondary rounded-xl p-1 h-auto">
          <TabsTrigger
            value="slack"
            className="flex-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg py-2.5 text-sm font-medium gap-2"
          >
            <Hash className="w-4 h-4" />
            Slack
            {visibleAnalyzed.length > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {visibleAnalyzed.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="gmail"
            className="flex-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg py-2.5 text-sm font-medium gap-2"
          >
            <Mail className="w-4 h-4" />
            Gmail
            {!providerToken && (
              <span className="text-[10px] text-muted-foreground">(sign in with Google)</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Slack Tab */}
        <TabsContent value="slack" className="space-y-4 mt-4">
          <ChannelSelector selectedChannel={selectedChannel} onSelect={setSelectedChannel} />

          {selectedChannel && (
            <>
              {/* AI Analysis Status */}
              {analyzeMutation.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                  <Brain className="w-4 h-4 text-primary animate-pulse" />
                  Analyzing messages with AI…
                </div>
              )}

              {/* AI-Detected Action Items */}
              {visibleAnalyzed.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    AI-Detected Tasks ({visibleAnalyzed.length})
                  </h2>
                  <AnimatePresence mode="popLayout">
                    {visibleAnalyzed.map((item, i) => (
                      <AIActionCard
                        key={item.id}
                        item={item}
                        index={i}
                        onDismiss={() => handleDismissAnalyzed(item.id)}
                        onSendNudge={(text) => handleSendAINudge(item, text)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {slackLoading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              )}

              {!slackLoading && visibleAnalyzed.length === 0 && !analyzeMutation.isPending && (
                <EmptyState
                  icon={<MessageSquare className="w-7 h-7 text-primary" />}
                  title="No messages"
                  subtitle="This channel has no recent messages."
                />
              )}
            </>
          )}

          {!selectedChannel && (
            <EmptyState
              icon={<Activity className="w-7 h-7 text-primary" />}
              title="Select a channel"
              subtitle="Pick a Slack channel to view AI-analyzed messages."
            />
          )}
        </TabsContent>

        {/* Gmail Tab */}
        <TabsContent value="gmail" className="space-y-4 mt-4">
          {!providerToken ? (
            <EmptyState
              icon={<Mail className="w-7 h-7 text-primary" />}
              title="Google sign-in required"
              subtitle="Sign in with Google on the login page to access your Gmail inbox."
            />
          ) : gmailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                {visibleGmail.length} email{visibleGmail.length !== 1 ? 's' : ''}
              </div>
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {visibleGmail.map((email, i) => (
                    <GmailCard
                      key={email.id}
                      email={email}
                      index={i}
                      onDismiss={() => handleDismissGmail(email.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {visibleGmail.length === 0 && (
                <EmptyState
                  icon={<Mail className="w-7 h-7 text-primary" />}
                  title="Inbox zero"
                  subtitle="No emails in your inbox. Nice work!"
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

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

export default Briefing;
