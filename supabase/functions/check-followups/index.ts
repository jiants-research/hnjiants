import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");

    // Validate JWT using getClaims (works with Lovable Cloud signing keys)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("[check-followups] Auth failed:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = { id: claimsData.claims.sub as string };

    // Service role client for DB operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "list") {
      const { data: followups } = await supabase
        .from("nudge_followups")
        .select(`
          *,
          slack_processed_messages:processed_message_id (
            employee_name:assignee,
            ai_nudge_draft,
            original_message:task_summary
          )
        `)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .lte("followup_at", new Date().toISOString())
        .order("followup_at", { ascending: true });

      return new Response(JSON.stringify({ followups: followups || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resolve") {
      const { followup_id } = body;
      if (!followup_id) {
        return new Response(JSON.stringify({ error: "followup_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the followup to check for linked Linear issue
      const { data: followup } = await supabase
        .from("nudge_followups")
        .select("*, slack_processed_messages:processed_message_id (external_task_id, external_task_url)")
        .eq("id", followup_id)
        .eq("user_id", user.id)
        .single();

      // Mark as resolved in DB
      await supabase
        .from("nudge_followups")
        .update({ status: "resolved" })
        .eq("id", followup_id)
        .eq("user_id", user.id);

      // Resolve the linked Linear issue if one exists
      if (followup) {
        const externalTaskId = followup.external_task_id ||
          (followup.slack_processed_messages as any)?.external_task_id;

        if (externalTaskId && externalTaskId !== 'webhook') {
          try {
            await resolveLinearIssue(supabase, user.id, externalTaskId);
            console.log(`[check-followups] Resolved Linear issue linked to followup ${followup_id}`);
          } catch (err: any) {
            console.error(`[check-followups] Failed to resolve Linear issue:`, err.message);
            // Don't fail the resolve action if Linear update fails
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_reminder") {
      const { followup_id } = body;
      if (!followup_id) {
        return new Response(JSON.stringify({ error: "followup_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: followup } = await supabase
        .from("nudge_followups")
        .select("*")
        .eq("id", followup_id)
        .eq("user_id", user.id)
        .single();

      if (!followup) {
        return new Response(JSON.stringify({ error: "Followup not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate a secondary reminder via OpenAI
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a polite workplace assistant. Generate a secondary follow-up reminder. This is a T+2 day reminder — the initial nudge was already sent. Be slightly more direct but still professional. Keep it to 1-2 sentences.",
            },
            {
              role: "user",
              content: `Generate a secondary reminder for task: "${followup.task_summary}" assigned to ${followup.assignee || "the team"}. The original nudge was sent 2 days ago with no response.`,
            },
          ],
        }),
      });

      let reminderText = `Hi, just following up again on "${followup.task_summary}" — could you share an update when you get a chance?`;
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content;
        if (content) reminderText = content;
      }

      // Send via Slack
      const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
      if (SLACK_BOT_TOKEN) {
        const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: followup.channel_id,
            text: reminderText,
            thread_ts: followup.slack_message_ts,
          }),
        });
        const slackData = await slackRes.json();
        console.log("Slack reminder sent:", slackData.ok);
      }

      // Mark as sent
      await supabase
        .from("nudge_followups")
        .update({ status: "sent" })
        .eq("id", followup_id)
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, reminder_text: reminderText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in check-followups:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Linear: Resolve issue by moving to Done state ──

async function resolveLinearIssue(supabase: any, userId: string, externalTaskId: string) {
  // Fetch user's Linear integration
  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "linear")
    .limit(1)
    .maybeSingle();

  if (!integration?.api_token) {
    console.log("[Linear] No integration found, skipping resolve");
    return;
  }

  const apiToken = integration.api_token as string;
  const config = (integration.config || {}) as Record<string, string>;
  const teamId = config.team_id;

  if (!teamId) {
    console.log("[Linear] No team_id configured, skipping resolve");
    return;
  }

  // First, find the Linear issue by identifier to get its internal ID
  const issueQuery = `
    query FindIssue($identifier: String!) {
      issueSearch(query: $identifier, first: 1) {
        nodes { id identifier }
      }
    }
  `;

  const issueRes = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
    },
    body: JSON.stringify({ query: issueQuery, variables: { identifier: externalTaskId } }),
  });

  const issueData = await issueRes.json();
  const issue = issueData.data?.issueSearch?.nodes?.[0];
  if (!issue) {
    console.log(`[Linear] Issue ${externalTaskId} not found, skipping resolve`);
    return;
  }

  // Get the "Done" workflow state for this team
  const statesQuery = `
    query GetDoneState($teamId: String!) {
      workflowStates(filter: { team: { id: { eq: $teamId } }, type: { eq: "completed" } }) {
        nodes { id name }
      }
    }
  `;

  const statesRes = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
    },
    body: JSON.stringify({ query: statesQuery, variables: { teamId } }),
  });

  const statesData = await statesRes.json();
  const doneState = statesData.data?.workflowStates?.nodes?.[0];
  if (!doneState) {
    console.error("[Linear] Could not find 'completed' workflow state for team", teamId);
    return;
  }

  // Update the issue to Done
  const updateMutation = `
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id state { name } }
      }
    }
  `;

  const updateRes = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
    },
    body: JSON.stringify({
      query: updateMutation,
      variables: {
        id: issue.id,
        input: { stateId: doneState.id },
      },
    }),
  });

  const updateData = await updateRes.json();
  if (updateData.errors) {
    throw new Error(updateData.errors[0].message);
  }

  console.log(`[Linear] Issue ${externalTaskId} moved to "${doneState.name}" state`);
}
