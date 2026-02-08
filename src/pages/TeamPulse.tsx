import { useTeamPulse } from '@/hooks/useTeamPulse';
import { TrendingUp, AlertCircle, Loader2, Users } from 'lucide-react';

const TeamPulse = () => {
  const { data: members = [], isLoading } = useTeamPulse();

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Team Pulse</h1>
          <p className="text-sm text-muted-foreground">Loading statistics…</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Team Pulse</h1>
        <p className="text-sm text-muted-foreground">
          Reliability overview · {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Member list */}
      {members.length === 0 ? (
        <div className="text-center py-20 space-y-3 animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <p className="text-foreground font-medium">No team data yet</p>
          <p className="text-muted-foreground text-sm">
            Analyze some Slack messages and send nudges to see team statistics.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member, i) => {
            const scoreColor =
              member.reliability_score >= 90
                ? 'text-primary'
                : member.reliability_score >= 75
                ? 'text-foreground'
                : 'text-accent';

            return (
              <div
                key={member.name}
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
                    {member.total_tasks} task{member.total_tasks !== 1 ? 's' : ''} · {member.resolved_count} resolved
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
      )}
    </div>
  );
};

export default TeamPulse;
