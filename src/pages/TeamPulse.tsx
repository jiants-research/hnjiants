import { mockTeamMembers } from '@/data/mockData';
import { TrendingUp, AlertCircle } from 'lucide-react';

const TeamPulse = () => {
  const sortedMembers = [...mockTeamMembers].sort(
    (a, b) => b.reliability_score - a.reliability_score
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Team Pulse
        </h1>
        <p className="text-sm text-muted-foreground">
          Reliability overview · {sortedMembers.length} members
        </p>
      </div>

      {/* Member list */}
      <div className="space-y-2">
        {sortedMembers.map((member, i) => {
          const scoreColor =
            member.reliability_score >= 90
              ? 'text-primary'
              : member.reliability_score >= 75
              ? 'text-foreground'
              : 'text-accent';

          return (
            <div
              key={member.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Rank */}
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground font-mono shrink-0">
                {i + 1}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground text-sm truncate">
                  {member.name}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {member.role}
                </p>
              </div>

              {/* Stats */}
              <div className="text-right shrink-0 space-y-0.5">
                <div className={`text-sm font-bold font-mono ${scoreColor}`}>
                  {member.reliability_score}%
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {member.open_loops > 0 ? (
                    <AlertCircle className="w-3 h-3 text-accent" />
                  ) : (
                    <TrendingUp className="w-3 h-3 text-primary" />
                  )}
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {member.open_loops} loop{member.open_loops !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamPulse;
