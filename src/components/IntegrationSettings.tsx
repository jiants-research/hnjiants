import { useState, useEffect } from 'react';
import { useIntegration, useSaveIntegration, useDeleteIntegration, useTestConnection } from '@/hooks/useIntegration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Check, Loader2, Trash2, Zap, ExternalLink } from 'lucide-react';

export const IntegrationSettings = () => {
  const { data: integration, isLoading } = useIntegration();
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const testConnection = useTestConnection();

  const [apiToken, setApiToken] = useState('');
  const [teamId, setTeamId] = useState('');

  useEffect(() => {
    if (integration) {
      setApiToken(integration.api_token || '');
      setTeamId((integration.config as Record<string, string>)?.team_id || '');
    }
  }, [integration]);

  const handleSave = () => {
    if (!apiToken) {
      toast.error('API key is required');
      return;
    }
    if (!teamId) {
      toast.error('Team ID is required');
      return;
    }

    saveIntegration.mutate(
      { config: { team_id: teamId }, api_token: apiToken },
      {
        onSuccess: () => toast.success('Linear integration saved!'),
        onError: (err) => toast.error('Failed to save', { description: err.message }),
      }
    );
  };

  const handleTest = () => {
    testConnection.mutate(undefined, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success('Connected to Linear!', { description: `Signed in as ${result.user}` });
        } else {
          toast.error('Connection failed', { description: result.error });
        }
      },
      onError: (err) => toast.error('Test failed', { description: err.message }),
    });
  };

  const handleDisconnect = () => {
    if (!integration) return;
    deleteIntegration.mutate(integration.id, {
      onSuccess: () => {
        toast.success('Linear disconnected');
        setApiToken('');
        setTeamId('');
      },
      onError: (err) => toast.error('Failed to remove', { description: err.message }),
    });
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" viewBox="0 0 100 100" fill="currentColor">
            <path d="M2.76 67.81l29.43-29.43a2.46 2.46 0 0 0-3.48-3.48L0 63.53a49.52 49.52 0 0 0 2.76 4.28zM10.2 77.2l40.83-40.83a2.46 2.46 0 0 0-3.48-3.48L6.85 73.59a49.7 49.7 0 0 0 3.35 3.61zM19.77 84.86l42.69-42.69a2.46 2.46 0 0 0-3.48-3.48L16.28 81.39a49.86 49.86 0 0 0 3.49 3.47zM31.79 90.56l42.3-42.3a2.46 2.46 0 0 0-3.48-3.48l-42.34 42.3a49.82 49.82 0 0 0 3.52 3.48zM46.63 94.31l38.94-38.94a2.46 2.46 0 0 0-3.48-3.48L43.2 90.78a50.16 50.16 0 0 0 3.43 3.53zM64.77 95.83l26.81-26.81a2.46 2.46 0 0 0-3.48-3.48L61.3 92.34a49.52 49.52 0 0 0 3.47 3.49z" />
          </svg>
          Linear
        </h3>
        {integration && (
          <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
            <Check className="w-3 h-3" />
            Connected
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Tasks are automatically synced to Linear during analysis. Resolving a follow-up also closes the Linear issue.
      </p>

      {/* Config Fields */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">API Key</label>
          <Input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="lin_api_..."
            className="h-9 text-xs bg-input border-border"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Team ID</label>
          <Input
            type="text"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g. abc123-..."
            className="h-9 text-xs bg-input border-border"
          />
        </div>
        <a
          href="https://linear.app/settings/api"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Get your Linear API key
        </a>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleSave}
          disabled={saveIntegration.isPending}
          className="flex-1 h-10 rounded-xl text-xs font-semibold"
        >
          {saveIntegration.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
          Save
        </Button>
        {integration && (
          <>
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={testConnection.isPending}
              className="h-10 rounded-xl text-xs font-semibold"
            >
              {testConnection.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Zap className="w-3.5 h-3.5 mr-1" />}
              Test
            </Button>
            <Button
              variant="ghost"
              onClick={handleDisconnect}
              disabled={deleteIntegration.isPending}
              className="h-10 rounded-xl text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
