import { useAuth } from '@/contexts/AuthContext';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { useSlackChannels } from '@/hooks/useSlack';
import { useNavigate } from 'react-router-dom';
import { LogOut, Hash, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const Settings = () => {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: channels = [] } = useSlackChannels();
  const navigate = useNavigate();

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || null;
  const displayEmail = user?.email || null;
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  const handleSetDefaultChannel = (channelId: string) => {
    updateProfile.mutate(
      { default_channel_id: channelId },
      {
        onSuccess: () => toast.success('Default channel updated'),
        onError: (err) => toast.error('Failed to update', { description: err.message }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your profile and preferences</p>
      </div>

      {/* Profile Card */}
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4">
        <UserAvatar
          avatarUrl={avatarUrl}
          fullName={displayName}
          email={displayEmail}
          size="lg"
        />
        <div className="text-center space-y-1">
          {displayName && (
            <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
          )}
          {displayEmail && (
            <p className="text-sm text-muted-foreground">{displayEmail}</p>
          )}
        </div>
      </div>

      {/* Default Channel */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Default Slack Channel</h3>
        <p className="text-xs text-muted-foreground">
          This channel loads automatically when you open the app.
        </p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {channels.map((ch) => {
            const isDefault = profile?.default_channel_id === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => handleSetDefaultChannel(ch.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isDefault
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-foreground hover:bg-secondary'
                }`}
                disabled={updateProfile.isPending}
              >
                <Hash className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1 text-left">{ch.name}</span>
                {isDefault && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
          {channels.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No channels available</p>
          )}
        </div>
      </div>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 bg-card border border-border rounded-xl px-4 py-3.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
};

export default Settings;
