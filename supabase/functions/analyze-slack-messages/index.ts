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
    console.log(`Grouped ${messages.length} messages into ${conversationUnits.length} conversation units (${conversationUnits.filter(u => u.type === 'thread').length} threads, ${conversationUnits.filter(u => u.type === 'standalone').length} standalone)`);

    // ── Step 2: Dedup — check which conversation units are already processed ──
    // Use the primary timestamp (thread_ts for threads, message ts for standalone) as the key
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

    const unitsForAI = newUnits.map((u, i) => ({
      index: i,
      type: u.type,
      conversation: u.conversation_text,
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
            content: `You are a workplace message analyzer. You will receive conversation units — each is either a single standalone message or a full thread conversation.

For THREAD conversations, analyze the entire thread as a whole to determine:
1. Whether the thread contains an explicit task, to-do, or request
2. Whether there's a deadline (specific date/time) or a missing deliverable
3. Whether the conversation indicates something unresolved or needs follow-up

For STANDALONE messages, analyze individually.

Return your analysis using the analyze_conversations function. Every conversation unit must have a result.`,
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
                        is_actionable: { type: "boolean", description: "True if the conversation contains a task, unresolved request, or deadline" },
                        task_summary: { type: "string", description: "Brief summary of the task/request, or null" },
                        deadline: { type: "string", description: "Extracted deadline if any, or null" },
                        assignee: { type: "string", description: "Who the task is assigned to, or null" },
                      },
                      required: ["index", "is_actionable"],
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
      const analysis = analyses.find((a: any) => a.index === i) || { is_actionable: false };
      const primaryTs = unit.thread_ts || unit.timestamps[0];
      return {
        slack_message_ts: primaryTs,
        channel_id,
        is_actionable: (analysis as any).is_actionable || false,
        task_summary: (analysis as any).task_summary || null,
        deadline: (analysis as any).deadline || null,
        assignee: (analysis as any).assignee || null,
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

    // ── Step 6: Create follow-up entries for actionable items ──
    const actionableRecords = records.filter((r) => r.is_actionable);

    if (actionableRecords.length > 0) {
      const { data: insertedMsgs } = await supabase
        .from("slack_processed_messages")
        .select("id, slack_message_ts")
        .eq("channel_id", channel_id)
        .eq("is_actionable", true)
        .eq("user_id", user.id)
        .in("slack_message_ts", actionableRecords.map((r) => r.slack_message_ts));

      if (insertedMsgs) {
        const tsToId = Object.fromEntries(insertedMsgs.map((m: any) => [m.slack_message_ts, m.id]));
        const followupRecords = actionableRecords
          .filter((r) => tsToId[r.slack_message_ts])
          .map((r) => ({
            processed_message_id: tsToId[r.slack_message_ts],
            channel_id: r.channel_id,
            slack_message_ts: r.slack_message_ts,
            task_summary: r.task_summary || "Follow up on task",
            assignee: r.assignee,
            followup_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            user_id: user.id,
            status: "pending",
          }));

        // Deduplicate against existing followups
        const { data: existingFollowups } = await supabase
          .from("nudge_followups")
          .select("slack_message_ts")
          .eq("channel_id", channel_id)
          .in("slack_message_ts", followupRecords.map((r) => r.slack_message_ts));

        const existingFollowupTs = new Set((existingFollowups || []).map((f: any) => f.slack_message_ts));
        const newFollowups = followupRecords.filter((f) => !existingFollowupTs.has(f.slack_message_ts));

        if (newFollowups.length > 0) {
          await supabase.from("nudge_followups").insert(newFollowups);
          console.log(`Created ${newFollowups.length} follow-up entries`);
        }
      }
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
