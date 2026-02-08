import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SlackMessageInput {
  slack_user_id: string;
  employee_name: string;
  original_message: string;
  timestamp: string;
  channel: string;
  thread_ts?: string | null;
}

interface ConversationUnit {
  index: number;
  type: "standalone" | "thread";
  thread_ts: string | null;
  timestamps: string[];
  conversation_text: string;
  primary_sender: string;
  messages: SlackMessageInput[];
}

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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, channel_id } = await req.json() as {
      messages: SlackMessageInput[];
      channel_id: string;
    };

    if (!messages?.length || !channel_id) {
      return new Response(JSON.stringify({ error: "messages and channel_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 1: Group messages into conversation units ──
    const conversationUnits = groupByThread(messages);
    console.log(`Grouped ${messages.length} messages into ${conversationUnits.length} conversation units`);

    // ── Step 2: Dedup — check which conversation units are already processed ──
    const primaryTimestamps = conversationUnits.map(u => u.thread_ts || u.timestamps[0]);
    const { data: existing } = await supabase
      .from("slack_processed_messages")
      .select("slack_message_ts")
      .eq("channel_id", channel_id)
      .in("slack_message_ts", primaryTimestamps);

    const existingTs = new Set((existing || []).map((e: any) => e.slack_message_ts));
    const newUnits = conversationUnits.filter(u => {
      const key = u.thread_ts || u.timestamps[0];
      return !existingTs.has(key);
    });

    if (newUnits.length === 0) {
      const { data: cached } = await supabase
        .from("slack_processed_messages")
        .select("*")
        .eq("channel_id", channel_id)
        .eq("user_id", user.id)
        .eq("is_actionable", true)
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({ results: cached || [], new_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 3: AI analysis on conversation units ──
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const now = new Date().toISOString();
    const unitsForAI = newUnits.map((u, i) => ({
      index: i,
      type: u.type,
      conversation: u.conversation_text,
      latest_timestamp: u.timestamps[u.timestamps.length - 1],
    }));

    console.log(`Analyzing ${newUnits.length} new conversation units from channel ${channel_id}`);

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a workplace message analyzer for a CEO/Manager. Current time: ${now}.

You will receive conversation units — each is either a single standalone message or a full thread conversation.

For each unit, determine:
1. Whether it contains an explicit task, request, deliverable, or unresolved question that requires the CEO's attention or a follow-up.
2. If it's a THREAD, check if replies already resolved the request. If resolved, mark as NOT actionable.
3. Assess urgency from the CEO's perspective:
   - "critical": Blocking work, overdue deadlines, escalations, client-facing issues, things that need immediate action
   - "high": Has a deadline within 48h, important decisions pending, people waiting
   - "medium": Tasks with reasonable timelines, general follow-ups needed
   - "low": Nice-to-have, informational, no time pressure
4. Identify the specific message (quote the exact text) that triggers the need for action/reply. This is the KEY message the CEO needs to see.
5. Identify who owns or is assigned to the task.
6. Extract the CONCRETE deadline or due time from the message context. Look for phrases like "by 12 PM", "before end of day", "within 2 hours", "by Friday", "tomorrow morning", etc. Convert these to an ISO 8601 datetime string (e.g. "2026-02-08T12:00:00Z"). Use the current time (${now}) as reference to resolve relative times. If NO specific time is mentioned, return null.

Return your analysis using the analyze_conversations function.`,
          },
          {
            role: "user",
            content: `Analyze these conversation units:\n\n${JSON.stringify(unitsForAI, null, 2)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_conversations",
              description: "Return analysis results for all conversation units",
              parameters: {
                type: "object",
                properties: {
                  analyses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number", description: "The conversation unit index" },
                        is_actionable: { type: "boolean", description: "True if requires CEO follow-up or action" },
                        task_summary: { type: "string", description: "Brief 1-line summary of what needs doing" },
                        deadline: { type: "string", description: "ISO 8601 datetime of the extracted deadline from the message context (e.g. '2026-02-08T12:00:00Z'). Must be a concrete time derived from the conversation. Return null if no specific time is mentioned." },
                        assignee: { type: "string", description: "Person responsible / task owner" },
                        urgency: { type: "string", enum: ["critical", "high", "medium", "low"], description: "Priority level for CEO" },
                        trigger_message: { type: "string", description: "The exact quote from the conversation that requires a response or action" },
                      },
                      required: ["index", "is_actionable", "urgency"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["analyses"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_conversations" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let analyses: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        analyses = parsed.analyses || [];
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    const actionableCount = analyses.filter((a: any) => a.is_actionable).length;
    console.log(`AI returned ${analyses.length} analyses, ${actionableCount} actionable`);

    // ── Step 4: Generate nudge drafts for actionable units ──
    const actionableAnalyses = analyses.filter((a: any) => a.is_actionable);
    let nudgeDrafts: Record<number, string> = {};

    if (actionableAnalyses.length > 0) {
      const nudgeResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
              content: `You are a polite workplace assistant. Generate context-aware follow-up nudge messages.
Each nudge should be friendly, professional, and reference the specific task/deadline.
Keep nudges to 1-2 sentences. Use the person's first name when available.`,
            },
            {
              role: "user",
              content: `Generate nudge messages for these actionable items:\n\n${JSON.stringify(
                actionableAnalyses.map((a: any) => {
                  const unit = newUnits[a.index];
                  return {
                    index: a.index,
                    sender: unit?.primary_sender,
                    task: a.task_summary,
                    deadline: a.deadline,
                    urgency: a.urgency,
                    conversation: unit?.conversation_text,
                  };
                })
              )}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_nudges",
                description: "Return nudge drafts for each actionable conversation",
                parameters: {
                  type: "object",
                  properties: {
                    nudges: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "number" },
                          nudge_text: { type: "string", description: "The polite nudge message" },
                        },
                        required: ["index", "nudge_text"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["nudges"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_nudges" } },
        }),
      });

      if (nudgeResponse.ok) {
        const nudgeData = await nudgeResponse.json();
        const nudgeToolCall = nudgeData.choices?.[0]?.message?.tool_calls?.[0];
        if (nudgeToolCall?.function?.arguments) {
          try {
            const parsed = JSON.parse(nudgeToolCall.function.arguments);
            for (const n of parsed.nudges || []) {
              nudgeDrafts[n.index] = n.nudge_text;
            }
          } catch (e) {
            console.error("Failed to parse nudge response:", e);
          }
        }
      }
    }

    // ── Step 5: Linear integration — search or auto-create issues ──
    const { data: linearIntegration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "linear")
      .limit(1)
      .maybeSingle();

    const linearResults: Record<number, { external_task_id: string; external_task_url: string }> = {};

    if (linearIntegration?.api_token) {
      const apiToken = linearIntegration.api_token as string;
      const config = (linearIntegration.config || {}) as Record<string, string>;
      const rawTeamId = config.team_id;

      if (rawTeamId) {
        // Resolve team key (e.g. "HNJ") to UUID
        let resolvedTeamId: string;
        try {
          resolvedTeamId = await resolveTeamId(apiToken, rawTeamId);
        } catch (err: any) {
          console.error("[Linear] Failed to resolve team ID:", err.message);
          resolvedTeamId = rawTeamId; // fallback
        }

        for (const analysis of actionableAnalyses) {
          const taskSummary = analysis.task_summary || '';
          if (!taskSummary) continue;

          try {
            // Search Linear for existing matching issues
            const searchResult = await searchLinearIssues(apiToken, taskSummary);

            if (searchResult) {
              console.log(`[Linear] Matched existing issue ${searchResult.identifier} for: "${taskSummary}"`);
              linearResults[analysis.index] = {
                external_task_id: searchResult.identifier,
                external_task_url: searchResult.url,
              };
            } else {
              const created = await createLinearIssue(apiToken, resolvedTeamId, taskSummary, analysis);
              console.log(`[Linear] Created issue ${created.identifier} for: "${taskSummary}"`);
              linearResults[analysis.index] = {
                external_task_id: created.identifier,
                external_task_url: created.url,
              };
            }
          } catch (err: any) {
            console.error(`[Linear] Failed to sync issue for index ${analysis.index}:`, err.message);
          }
        }
      } else {
        console.log("[Linear] Integration found but no team_id configured, skipping sync");
      }
    }

    // ── Step 6: Store results — one record per conversation unit ──
    const records = newUnits.map((unit, i) => {
      const analysis = analyses.find((a: any) => a.index === i) || { is_actionable: false, urgency: "medium" };
      const primaryTs = unit.thread_ts || unit.timestamps[0];
      const linear = linearResults[i];
      return {
        slack_message_ts: primaryTs,
        channel_id,
        is_actionable: (analysis as any).is_actionable || false,
        task_summary: (analysis as any).task_summary || null,
        deadline: (analysis as any).deadline || null,
        assignee: (analysis as any).assignee || null,
        urgency: (analysis as any).urgency || "medium",
        trigger_message: (analysis as any).trigger_message || null,
        ai_nudge_draft: nudgeDrafts[i] || null,
        user_id: user.id,
        external_task_id: linear?.external_task_id || null,
        external_task_url: linear?.external_task_url || null,
      };
    });

    const { error: insertError } = await supabase
      .from("slack_processed_messages")
      .upsert(records, { onConflict: "slack_message_ts,channel_id" });

    if (insertError) {
      console.error("Insert error:", insertError);
    }

    // Return all actionable items for this channel
    const { data: allActionable } = await supabase
      .from("slack_processed_messages")
      .select("*")
      .eq("channel_id", channel_id)
      .eq("user_id", user.id)
      .eq("is_actionable", true)
      .order("created_at", { ascending: false });

    return new Response(
      JSON.stringify({
        results: allActionable || [],
        new_count: newUnits.length,
        actionable_count: actionableCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in analyze-slack-messages:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Linear helpers ──

async function searchLinearIssues(apiToken: string, query: string): Promise<{ id: string; identifier: string; url: string; title: string } | null> {
  const searchQuery = `
    query SearchIssues($query: String!) {
      issueSearch(query: $query, first: 5) {
        nodes {
          id
          identifier
          url
          title
          state { name type }
        }
      }
    }
  `;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
    },
    body: JSON.stringify({ query: searchQuery, variables: { query } }),
  });

  const data = await res.json();
  if (data.errors) {
    console.error("[Linear] Search error:", data.errors[0].message);
    return null;
  }

  const nodes = data.data?.issueSearch?.nodes || [];
  if (nodes.length === 0) return null;

  // Find a close title match (case-insensitive substring match)
  const queryLower = query.toLowerCase();
  const match = nodes.find((n: any) => {
    const titleLower = (n.title || '').toLowerCase();
    // Check if titles share significant overlap
    const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 3);
    const matchCount = queryWords.filter((w: string) => titleLower.includes(w)).length;
    return matchCount >= Math.ceil(queryWords.length * 0.5);
  });

  if (match) {
    return { id: match.id, identifier: match.identifier, url: match.url, title: match.title };
  }

  return null;
}

async function createLinearIssue(
  apiToken: string,
  teamId: string,
  title: string,
  analysis: any,
): Promise<{ id: string; identifier: string; url: string }> {
  const priorityMap: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
  const priority = priorityMap[analysis.urgency || 'medium'] || 3;

  const description = [
    analysis.trigger_message ? `> ${analysis.trigger_message}` : '',
    analysis.assignee ? `**Assigned to:** ${analysis.assignee}` : '',
    analysis.deadline ? `**Deadline:** ${analysis.deadline}` : '',
    `\n_Auto-created by Nudge Engine_`,
  ].filter(Boolean).join('\n');

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }
  `;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": apiToken,
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
  return { id: issue.id, identifier: issue.identifier, url: issue.url };
}

// ── Helper: Group flat messages into conversation units ──
function groupByThread(messages: SlackMessageInput[]): ConversationUnit[] {
  const threadMap = new Map<string, SlackMessageInput[]>();
  const standalone: SlackMessageInput[] = [];

  for (const msg of messages) {
    if (msg.thread_ts) {
      const group = threadMap.get(msg.thread_ts) || [];
      group.push(msg);
      threadMap.set(msg.thread_ts, group);
    } else {
      standalone.push(msg);
    }
  }

  const units: ConversationUnit[] = [];
  let idx = 0;

  for (const msg of standalone) {
    units.push({
      index: idx++,
      type: "standalone",
      thread_ts: null,
      timestamps: [msg.timestamp],
      conversation_text: `${msg.employee_name}: ${msg.original_message}`,
      primary_sender: msg.employee_name,
      messages: [msg],
    });
  }

  for (const [threadTs, msgs] of threadMap) {
    const sorted = msgs.sort((a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp));
    const conversationText = sorted
      .map((m) => `${m.employee_name}: ${m.original_message}`)
      .join("\n");

    units.push({
      index: idx++,
      type: "thread",
      thread_ts: threadTs,
      timestamps: sorted.map((m) => m.timestamp),
      conversation_text: conversationText,
      primary_sender: sorted[0].employee_name,
      messages: sorted,
    });
  }

  return units;
}
