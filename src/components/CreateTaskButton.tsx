import { useState } from 'react';
import { useCreateExternalTask, useIntegration } from '@/hooks/useIntegration';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ClipboardList, ExternalLink, Loader2 } from 'lucide-react';

interface CreateTaskButtonProps {
  title: string;
  description?: string;
  assignee?: string;
  urgency?: string;
  deadline?: string;
  sourceType: 'processed_message' | 'followup';
  sourceId: string;
  externalTaskUrl?: string | null;
  externalTaskId?: string | null;
  variant?: 'full' | 'compact';
}

export const CreateTaskButton = ({
  title,
  description,
  assignee,
  urgency,
  deadline,
  sourceType,
  sourceId,
  externalTaskUrl,
  externalTaskId,
  variant = 'full',
}: CreateTaskButtonProps) => {
  const { data: integration } = useIntegration();
  const createTask = useCreateExternalTask();
  const [localUrl, setLocalUrl] = useState<string | null>(externalTaskUrl || null);
  const [localId, setLocalId] = useState<string | null>(externalTaskId || null);

  // If already linked, show a badge/link
  const linked = localUrl || localId;

  if (!integration) return null; // No integration configured — hide button

  if (linked) {
    return (
      <a
        href={localUrl || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1 hover:bg-primary/15 transition-colors ${
          !localUrl ? 'pointer-events-none' : ''
        }`}
      >
        <ExternalLink className="w-3 h-3" />
        {localId && localId !== 'webhook' ? localId : 'Linked'}
      </a>
    );
  }

  const handleCreate = () => {
    createTask.mutate(
      {
        title,
        description,
        assignee,
        urgency,
        deadline,
        source_type: sourceType,
        source_id: sourceId,
      },
      {
        onSuccess: (data) => {
          setLocalUrl(data.external_task_url);
          setLocalId(data.external_task_id);
          toast.success('Task created!', {
            description: data.external_task_url ? 'Click the badge to open it.' : undefined,
          });
        },
        onError: (err) => toast.error('Failed to create task', { description: err.message }),
      }
    );
  };

  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCreate}
        disabled={createTask.isPending}
        className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg"
      >
        {createTask.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ClipboardList className="w-3.5 h-3.5" />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      onClick={handleCreate}
      disabled={createTask.isPending}
      className="flex-1 h-12 rounded-xl font-semibold transition-all active:scale-[0.97]"
    >
      {createTask.isPending ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <ClipboardList className="w-4 h-4 mr-2" />
      )}
      Create Task
    </Button>
  );
};
