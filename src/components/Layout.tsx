import { ReactNode } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { UserAvatar } from '@/components/UserAvatar';
import { Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-surface border-b border-border">
        <div className="flex items-center gap-2.5 max-w-lg mx-auto px-5 py-3.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold text-foreground tracking-tight text-[15px]">
            NUDGE
          </span>
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase ml-1">
            Engine
          </span>
          <div className="flex-1" />
          <button
            onClick={() => navigate('/settings')}
            className="rounded-full ring-2 ring-transparent hover:ring-primary/30 transition-all"
            aria-label="Settings"
          >
            <UserAvatar
              avatarUrl={avatarUrl}
              fullName={fullName}
              email={user?.email}
              size="sm"
            />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 py-6 pb-28 max-w-lg mx-auto w-full">
        {children}
      </main>

      {/* Bottom Nav */}
      <BottomNav />
    </div>
  );
};
