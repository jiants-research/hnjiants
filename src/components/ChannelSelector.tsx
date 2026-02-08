import { useSlackChannels, SlackChannel } from '@/hooks/useSlack';
import { useDefaultChannel, useSetDefaultChannel } from '@/hooks/useDefaultChannel';
import { Hash, Loader2, AlertTriangle, Star } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface ChannelSelectorProps {
  selectedChannel: string | null;
  onSelect: (channelId: string) => void;
}

export const ChannelSelector = ({ selectedChannel, onSelect }: ChannelSelectorProps) => {
  const { data: channels = [], isLoading, error } = useSlackChannels();
  const { data: defaultChannelId } = useDefaultChannel();
  const setDefaultChannel = useSetDefaultChannel();

  const handleToggleDefault = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newDefault = defaultChannelId === channelId ? null : channelId;
    setDefaultChannel.mutate(newDefault, {
      onSuccess: () => {
        toast.success(newDefault ? 'Default channel saved' : 'Default channel cleared');
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading Slack channels…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-accent py-2">
        <AlertTriangle className="w-4 h-4" />
        <span className="truncate">Failed to load channels: {(error as Error).message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {channels.map((ch: SlackChannel) => {
        const isSelected = selectedChannel === ch.id;
        const isDefault = defaultChannelId === ch.id;

        return (
          <button
            key={ch.id}
            onClick={() => onSelect(ch.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              isSelected
                ? 'bg-primary/10 border border-primary/30 text-foreground'
                : 'bg-card border border-border text-foreground hover:bg-secondary/60'
            }`}
          >
            <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-left font-medium truncate">{ch.name}</span>
            <span className="text-muted-foreground text-xs">{ch.num_members}</span>

            {/* Default checkbox */}
            <div
              onClick={(e) => handleToggleDefault(ch.id, e)}
              className="flex items-center gap-1 shrink-0 cursor-pointer"
              title={isDefault ? 'Remove as default' : 'Set as default channel'}
            >
              <Star
                className={`w-3.5 h-3.5 ${
                  isDefault ? 'text-primary fill-primary' : 'text-muted-foreground/40'
                }`}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};
