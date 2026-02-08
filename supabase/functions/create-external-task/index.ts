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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // --- Test Connection Action ---
    if (body.action === 'test') {
      const { data: integration, error: intError } = await adminClient
        .from('integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'linear')
        .limit(1)
        .maybeSingle();

      if (intError) throw intError;
      if (!integration) {
        return new Response(JSON.stringify({ error: 'No Linear integration configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await testLinearConnection(integration.api_token);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- Create Task Action ---
    const { data: integration, error: intError } = await adminClient
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'linear')
      .limit(1)
      .maybeSingle();

    if (intError) throw intError;
    if (!integration) {
      return new Response(JSON.stringify({ error: 'No Linear integration configured. Go to Settings to set one up.' }), {
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

    const apiToken = integration.api_token;
    const config = integration.config as Record<string, string>;

    if (!apiToken) {
      return new Response(JSON.stringify({ error: 'Linear API token not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const taskDescription = [
      description || '',
      assignee ? `Assigned to: ${assignee}` : '',
      urgency ? `Urgency: ${urgency}` : '',
      deadline ? `Deadline: ${deadline}` : '',
      `Source: Nudge Engine`,
    ].filter(Boolean).join('\n');

    const result = await createLinearIssue(apiToken, config, title, taskDescription, urgency);

    // Update source record
    const table = source_type === 'processed_message' ? 'slack_processed_messages' : 'nudge_followups';
    const { error: updateError } = await adminClient
      .from(table)
      .update({ external_task_id: result.id, external_task_url: result.url })
      .eq('id', source_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('[create-external-task] Failed to update source record:', updateError);
    }

    console.log('[create-external-task] Linear issue created:', result);

    return new Response(JSON.stringify({
      success: true,
      external_task_id: result.id,
      external_task_url: result.url,
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

// ── Linear Implementation ──

// Resolve a team key (e.g. "HNJ") or UUID to the actual team UUID
async function resolveTeamId(apiToken: string, teamIdOrKey: string): Promise<string> {
  // If it looks like a UUID already, return as-is
  if (teamIdOrKey.includes('-') && teamIdOrKey.length > 20) {
    return teamIdOrKey;
  }

  // Otherwise, look up by key
  const query = `
    query {
      teams {
        nodes { id key name }
      }
    }
  `;

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': apiToken },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  if (data.errors) throw new Error(`Failed to fetch teams: ${data.errors[0].message}`);

  const teams = data.data?.teams?.nodes || [];
  const match = teams.find((t: any) => t.key === teamIdOrKey || t.id === teamIdOrKey);
  if (!match) throw new Error(`Team "${teamIdOrKey}" not found. Available: ${teams.map((t: any) => t.key).join(', ')}`);

  console.log(`[Linear] Resolved team key "${teamIdOrKey}" to UUID "${match.id}" (${match.name})`);
  return match.id;
}

async function createLinearIssue(
  apiToken: string,
  config: Record<string, string>,
  title: string,
  description: string,
  urgency?: string,
) {
  const rawTeamId = config.team_id;
  if (!rawTeamId) throw new Error('Linear team_id not configured');

  const teamId = await resolveTeamId(apiToken, rawTeamId);

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

  console.log('[Linear] Creating issue:', { teamId, title, priority });

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

async function testLinearConnection(apiToken: string | null) {
  if (!apiToken) return { success: false, error: 'No API token configured' };

  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': apiToken },
      body: JSON.stringify({ query: '{ viewer { id name } }' }),
    });
    const data = await res.json();
    if (data.errors) return { success: false, error: data.errors[0].message };
    return { success: true, user: data.data.viewer.name };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
