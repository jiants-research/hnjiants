import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface TaskPayload {
  title: string;
  description?: string;
  assignee?: string;
  urgency?: string;
  deadline?: string;
  source_type: 'processed_message' | 'followup';
  source_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as TaskPayload & { action?: string };
    console.log('[create-external-task] Action:', body.action || 'create', 'User:', user.id);

    // Use service role for DB operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // --- Test Connection Action ---
    if (body.action === 'test') {
      const { data: integration, error: intError } = await adminClient
        .from('integrations')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (intError) throw intError;
      if (!integration) {
        return new Response(JSON.stringify({ error: 'No integration configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await testConnection(integration.provider, integration.config, integration.api_token);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Create Task Action ---
    // Fetch user's integration
    const { data: integration, error: intError } = await adminClient
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (intError) throw intError;
    if (!integration) {
      return new Response(JSON.stringify({ error: 'No integration configured. Go to Settings to set one up.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { title, description, assignee, urgency, deadline, source_type, source_id } = body;
    if (!title || !source_type || !source_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: title, source_type, source_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build task description
    const taskDescription = [
      description || '',
      assignee ? `Assigned to: ${assignee}` : '',
      urgency ? `Urgency: ${urgency}` : '',
      deadline ? `Deadline: ${deadline}` : '',
      `Source: Nudge Engine`,
    ].filter(Boolean).join('\n');

    let externalTaskId: string | null = null;
    let externalTaskUrl: string | null = null;

    const provider = integration.provider;
    const config = integration.config as Record<string, string>;
    const apiToken = integration.api_token;

    if (!apiToken) {
      return new Response(JSON.stringify({ error: 'API token not configured for this integration' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Provider Handlers ---
    if (provider === 'linear') {
      const result = await createLinearIssue(apiToken, config, title, taskDescription, urgency);
      externalTaskId = result.id;
      externalTaskUrl = result.url;
    } else if (provider === 'jira') {
      const result = await createJiraIssue(apiToken, config, title, taskDescription, urgency);
      externalTaskId = result.id;
      externalTaskUrl = result.url;
    } else if (provider === 'asana') {
      const result = await createAsanaTask(apiToken, config, title, taskDescription);
      externalTaskId = result.id;
      externalTaskUrl = result.url;
    } else if (provider === 'webhook') {
      const result = await sendWebhook(config, { title, description: taskDescription, assignee, urgency, deadline });
      externalTaskId = 'webhook';
      externalTaskUrl = null;
    } else {
      return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update source record with external task info
    const table = source_type === 'processed_message' ? 'slack_processed_messages' : 'nudge_followups';
    const { error: updateError } = await adminClient
      .from(table)
      .update({ external_task_id: externalTaskId, external_task_url: externalTaskUrl })
      .eq('id', source_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[create-external-task] Failed to update source record:', updateError);
    }

    console.log('[create-external-task] Task created:', { provider, externalTaskId, externalTaskUrl });

    return new Response(JSON.stringify({
      success: true,
      external_task_id: externalTaskId,
      external_task_url: externalTaskUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[create-external-task] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Provider Implementations ──

async function createLinearIssue(
  apiToken: string,
  config: Record<string, string>,
  title: string,
  description: string,
  urgency?: string,
) {
  const teamId = config.team_id;
  if (!teamId) throw new Error('Linear team_id not configured');

  const priorityMap: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
  const priority = priorityMap[urgency || 'medium'] || 3;

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }
  `;

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiToken,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: { teamId, title, description, priority },
      },
    }),
  });

  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  if (!data.data?.issueCreate?.success) throw new Error('Linear issue creation failed');

  const issue = data.data.issueCreate.issue;
  return { id: issue.identifier, url: issue.url };
}

async function createJiraIssue(
  apiToken: string,
  config: Record<string, string>,
  title: string,
  description: string,
  urgency?: string,
) {
  const domain = config.domain;
  const projectKey = config.project_key;
  const email = config.email;
  if (!domain || !projectKey || !email) throw new Error('Jira domain, project_key, and email required');

  const priorityMap: Record<string, string> = { critical: 'Highest', high: 'High', medium: 'Medium', low: 'Low' };

  const res = await fetch(`https://${domain}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(`${email}:${apiToken}`)}`,
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: title,
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
        },
        issuetype: { name: 'Task' },
        priority: { name: priorityMap[urgency || 'medium'] || 'Medium' },
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.errorMessages?.join(', ') || 'Jira issue creation failed');

  return { id: data.key, url: `https://${domain}/browse/${data.key}` };
}

async function createAsanaTask(
  apiToken: string,
  config: Record<string, string>,
  title: string,
  description: string,
) {
  const projectId = config.project_id;

  const body: Record<string, any> = { name: title, notes: description };
  if (projectId) body.projects = [projectId];

  const res = await fetch('https://app.asana.com/api/1.0/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ data: body }),
  });

  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);

  const taskId = data.data.gid;
  return { id: taskId, url: `https://app.asana.com/0/${projectId || '0'}/${taskId}` };
}

async function sendWebhook(
  config: Record<string, string>,
  payload: Record<string, any>,
) {
  const webhookUrl = config.webhook_url;
  if (!webhookUrl) throw new Error('Webhook URL not configured');

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook failed (${res.status}): ${text}`);
  }

  return { id: 'webhook', url: null };
}

async function testConnection(
  provider: string,
  config: Record<string, string>,
  apiToken: string | null,
) {
  if (!apiToken) return { success: false, error: 'No API token configured' };

  try {
    if (provider === 'linear') {
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': apiToken },
        body: JSON.stringify({ query: '{ viewer { id name } }' }),
      });
      const data = await res.json();
      if (data.errors) return { success: false, error: data.errors[0].message };
      return { success: true, user: data.data.viewer.name };
    }

    if (provider === 'jira') {
      const { domain, email } = config;
      if (!domain || !email) return { success: false, error: 'Missing domain or email' };
      const res = await fetch(`https://${domain}/rest/api/3/myself`, {
        headers: { 'Authorization': `Basic ${btoa(`${email}:${apiToken}`)}` },
      });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { success: true, user: data.displayName };
    }

    if (provider === 'asana') {
      const res = await fetch('https://app.asana.com/api/1.0/users/me', {
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });
      const data = await res.json();
      if (data.errors) return { success: false, error: data.errors[0].message };
      return { success: true, user: data.data.name };
    }

    if (provider === 'webhook') {
      return { success: true, message: 'Webhook configured — will POST when a task is created' };
    }

    return { success: false, error: 'Unknown provider' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
