import { useLocation, useNavigate } from 'react-router-dom';
import { Inbox, Bell, Users } from 'lucide-react';

const navItems = [
  { label: 'Briefing', icon: Inbox, path: '/' },
  { label: 'Follow-ups', icon: Bell, path: '/follow-ups' },
  { label: 'Team Pulse', icon: Users, path: '/team-pulse' },
];

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass-surface border-t border-border z-50 safe-area-pb">
      <div className="flex max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center gap-1 py-3.5 transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
              <span className="text-[11px] font-medium tracking-wide">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
