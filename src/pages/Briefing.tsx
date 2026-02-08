import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSlackMessages, sendSlackNudge, SlackMessage } from '@/hooks/useSlack';
import { useGmailMessages } from '@/hooks/useGmail';
import { useAuth } from '@/contexts/AuthContext';
import { ChannelSelector } from '@/components/ChannelSelector';
import { SlackMessageCard } from '@/components/SlackMessageCard';
import { GmailCard } from '@/components/GmailCard';
import { toast } from 'sonner';
import { Activity, Loader2, MessageSquare, Mail, Hash } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Briefing = () => {
  const { providerToken } = useAuth();
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [dismissedSlackTs, setDismissedSlackTs] = useState<Set<string>>(new Set());
  const [dismissedGmailIds, setDismissedGmailIds] = useState<Set<string>>(new Set());

  const { data: slackMessages = [], isLoading: slackLoading } = useSlackMessages(selectedChannel);
  const { data: gmailMessages = [], isLoading: gmailLoading } = useGmailMessages(providerToken);

  const visibleSlack = slackMessages.filter((m) => !dismissedSlackTs.has(m.timestamp));
  const visibleGmail = gmailMessages.filter((m) => !dismissedGmailIds.has(m.id));

  const handleDismissSlack = (ts: string) => {
    setDismissedSlackTs((prev) => new Set(prev).add(ts));
    toast('Message dismissed');
  };

  const handleSendNudge = async (msg: SlackMessage, nudgeText: string) => {
    try {
      await sendSlackNudge(msg.channel, nudgeText, msg.timestamp);
      setDismissedSlackTs((prev) => new Set(prev).add(msg.timestamp));
      toast.success('Nudge sent!', { description: `Reply sent to thread.` });
    } catch (err: any) {
      toast.error('Failed to send nudge', { description: err.message });
    }
  };

  const handleDismissGmail = (id: string) => {
    setDismissedGmailIds((prev) => new Set(prev).add(id));
    toast('Email dismissed');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Briefing</h1>
        <p className="text-sm text-muted-foreground">
          Your messages from Slack &amp; Gmail
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="slack" className="w-full">
        <TabsList className="w-full bg-secondary rounded-xl p-1 h-auto">
          <TabsTrigger
            value="slack"
            className="flex-1 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg py-2.5 text-sm font-medium gap-2"
          >
            <Hash className="w-4 h-4" />
            Slack
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
              <div className="text-sm text-muted-foreground">
                {visibleSlack.length} message{visibleSlack.length !== 1 ? 's' : ''}
              </div>

              {slackLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {visibleSlack.map((msg, i) => (
                      <SlackMessageCard
                        key={msg.timestamp}
                        message={msg}
                        index={i}
                        onDismiss={() => handleDismissSlack(msg.timestamp)}
                        onSendNudge={(text) => handleSendNudge(msg, text)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {!slackLoading && visibleSlack.length === 0 && (
                <EmptyState icon={<MessageSquare className="w-7 h-7 text-primary" />} title="No messages" subtitle="This channel has no recent messages." />
              )}
            </>
          )}

          {!selectedChannel && (
            <EmptyState icon={<Activity className="w-7 h-7 text-primary" />} title="Select a channel" subtitle="Pick a Slack channel to view messages." />
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
                <EmptyState icon={<Mail className="w-7 h-7 text-primary" />} title="Inbox zero" subtitle="No emails in your inbox. Nice work!" />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const EmptyState = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) => (
  <div className="text-center py-20 space-y-3 animate-fade-in">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
      {icon}
    </div>
    <p className="text-foreground font-medium">{title}</p>
    <p className="text-muted-foreground text-sm">{subtitle}</p>
  </div>
);

export default Briefing;
