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
        model: "gpt-4o-mini",
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
                        deadline: { type: "string", description: "Extracted deadline if any, or null" },
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

    // ── Step 5: Store results — one record per conversation unit ──
    const records = newUnits.map((unit, i) => {
      const analysis = analyses.find((a: any) => a.index === i) || { is_actionable: false, urgency: "medium" };
      const primaryTs = unit.thread_ts || unit.timestamps[0];
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
      };
    });

    const { error: insertError } = await supabase
      .from("slack_processed_messages")
      .upsert(records, { onConflict: "slack_message_ts,channel_id" });

    if (insertError) {
      console.error("Insert error:", insertError);
    }

    // Follow-ups are now created on the frontend when user clicks "Send Nudge"

    // Return all actionable items for this channel, sorted by urgency
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

  // Standalone messages
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

  // Threaded conversations — sorted by timestamp
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
