import { useSlackChannels, SlackChannel } from '@/hooks/useSlack';
import { Hash, Loader2, AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ChannelSelectorProps {
  selectedChannel: string | null;
  onSelect: (channelId: string) => void;
}

export const ChannelSelector = ({ selectedChannel, onSelect }: ChannelSelectorProps) => {
  const { data: channels = [], isLoading, error } = useSlackChannels();

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
    <Select value={selectedChannel ?? ''} onValueChange={onSelect}>
      <SelectTrigger className="bg-card border-border text-foreground h-11 rounded-xl">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
          <SelectValue placeholder="Select a Slack channel" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {channels.map((ch: SlackChannel) => (
          <SelectItem key={ch.id} value={ch.id} className="text-foreground">
            <span className="flex items-center gap-2">
              <Hash className="w-3 h-3 text-muted-foreground" />
              {ch.name}
              <span className="text-muted-foreground text-xs ml-auto">
                {ch.num_members} members
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
