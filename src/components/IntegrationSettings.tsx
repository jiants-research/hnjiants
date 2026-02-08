import { useState, useEffect } from 'react';
import { useIntegration, useSaveIntegration, useDeleteIntegration, useTestConnection, type IntegrationProvider } from '@/hooks/useIntegration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Link2, Check, Loader2, Trash2, Zap, ExternalLink } from 'lucide-react';

const PROVIDERS: { value: IntegrationProvider; label: string; description: string }[] = [
  { value: 'linear', label: 'Linear', description: 'GraphQL API — create issues automatically' },
  { value: 'jira', label: 'Jira', description: 'REST API — create issues in your Jira project' },
  { value: 'asana', label: 'Asana', description: 'REST API — create tasks in your workspace' },
  { value: 'webhook', label: 'Custom Webhook', description: 'POST JSON to any URL (Zapier, Make, n8n)' },
];

export const IntegrationSettings = () => {
  const { data: integration, isLoading } = useIntegration();
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const testConnection = useTestConnection();

  const [provider, setProvider] = useState<IntegrationProvider>('linear');
  const [apiToken, setApiToken] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});

  // Sync form with existing integration
  useEffect(() => {
    if (integration) {
      setProvider(integration.provider);
      setConfig(integration.config || {});
      setApiToken(integration.api_token || '');
    }
  }, [integration]);

  const handleSave = () => {
    if (!apiToken && provider !== 'webhook') {
      toast.error('API token is required');
      return;
    }
    if (provider === 'webhook' && !config.webhook_url) {
      toast.error('Webhook URL is required');
      return;
    }

    saveIntegration.mutate(
      { provider, config, api_token: apiToken },
      {
        onSuccess: () => toast.success('Integration saved!'),
        onError: (err) => toast.error('Failed to save', { description: err.message }),
      }
    );
  };

  const handleTest = () => {
    testConnection.mutate(undefined, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success('Connection successful!', { description: result.user || result.message });
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
        toast.success('Integration removed');
        setApiToken('');
        setConfig({});
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
          <Link2 className="w-4 h-4 text-primary" />
          Project Management
        </h3>
        {integration && (
          <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
            <Check className="w-3 h-3" />
            Connected
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Connect a PM tool to export tasks directly from your briefing.
      </p>

      {/* Provider Selector */}
      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.value}
            onClick={() => {
              setProvider(p.value);
              setConfig({});
              setApiToken('');
            }}
            className={`text-left px-3 py-2.5 rounded-lg text-xs transition-colors border ${
              provider === p.value
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'text-foreground hover:bg-secondary border-border'
            }`}
          >
            <span className="font-semibold block">{p.label}</span>
            <span className="text-muted-foreground text-[10px] leading-tight">{p.description}</span>
          </button>
        ))}
      </div>

      {/* Dynamic Config Fields */}
      <div className="space-y-3">
        {provider === 'linear' && (
          <>
            <ConfigInput label="API Key" value={apiToken} onChange={setApiToken} type="password" placeholder="lin_api_..." />
            <ConfigInput label="Team ID" value={config.team_id || ''} onChange={(v) => setConfig({ ...config, team_id: v })} placeholder="e.g. abc123-..." />
            <HelpLink href="https://linear.app/settings/api" text="Get your Linear API key" />
          </>
        )}

        {provider === 'jira' && (
          <>
            <ConfigInput label="Jira Domain" value={config.domain || ''} onChange={(v) => setConfig({ ...config, domain: v })} placeholder="yourcompany.atlassian.net" />
            <ConfigInput label="Email" value={config.email || ''} onChange={(v) => setConfig({ ...config, email: v })} placeholder="you@company.com" />
            <ConfigInput label="API Token" value={apiToken} onChange={setApiToken} type="password" placeholder="Your Jira API token" />
            <ConfigInput label="Project Key" value={config.project_key || ''} onChange={(v) => setConfig({ ...config, project_key: v })} placeholder="e.g. PROJ" />
            <HelpLink href="https://id.atlassian.com/manage-profile/security/api-tokens" text="Create a Jira API token" />
          </>
        )}

        {provider === 'asana' && (
          <>
            <ConfigInput label="Personal Access Token" value={apiToken} onChange={setApiToken} type="password" placeholder="Your Asana PAT" />
            <ConfigInput label="Project ID (optional)" value={config.project_id || ''} onChange={(v) => setConfig({ ...config, project_id: v })} placeholder="e.g. 1234567890" />
            <HelpLink href="https://developers.asana.com/docs/personal-access-token" text="Create an Asana PAT" />
          </>
        )}

        {provider === 'webhook' && (
          <>
            <ConfigInput label="Webhook URL" value={config.webhook_url || ''} onChange={(v) => setConfig({ ...config, webhook_url: v })} placeholder="https://hooks.zapier.com/..." />
            <p className="text-[10px] text-muted-foreground">
              Tasks will be POSTed as JSON with title, description, assignee, urgency, and deadline fields.
            </p>
          </>
        )}
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

const ConfigInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) => (
  <div className="space-y-1">
    <label className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">{label}</label>
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 text-xs bg-input border-border"
    />
  </div>
);

const HelpLink = ({ href, text }: { href: string; text: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
  >
    <ExternalLink className="w-3 h-3" />
    {text}
  </a>
);
