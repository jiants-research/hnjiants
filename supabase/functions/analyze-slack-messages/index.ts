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
}

interface AIAnalysis {
  is_actionable: boolean;
  task_summary: string | null;
  deadline: string | null;
  assignee: string | null;
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

    // Verify user
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

    // Check which messages are already processed (cache layer)
    const timestamps = messages.map((m) => m.timestamp);
    const { data: existing } = await supabase
      .from("slack_processed_messages")
      .select("slack_message_ts")
      .eq("channel_id", channel_id)
      .in("slack_message_ts", timestamps);

    const existingTs = new Set((existing || []).map((e: any) => e.slack_message_ts));
    const newMessages = messages.filter((m) => !existingTs.has(m.timestamp));

    if (newMessages.length === 0) {
      // Return already-cached results
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

    // Batch messages for AI analysis (OpenAI)
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const messagesForAI = newMessages.map((m, i) => ({
      index: i,
      sender: m.employee_name,
      text: m.original_message,
      timestamp: m.timestamp,
    }));

    console.log(`Analyzing ${newMessages.length} new messages from channel ${channel_id}`);

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
            content: `You are a workplace message analyzer. For each message, determine if it contains:
1. An explicit task or "to-do"
2. A deadline (specific date/time) or a "missing" deadline (e.g., "Where is that report?")
3. Contextual urgency

You must analyze ALL messages provided and return results for each one.

Return your analysis using the analyze_messages function.`,
          },
          {
            role: "user",
            content: `Analyze these Slack messages and determine which ones are actionable:\n\n${JSON.stringify(messagesForAI, null, 2)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_messages",
              description: "Return analysis results for all messages",
              parameters: {
                type: "object",
                properties: {
                  analyses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number", description: "The message index from the input" },
                        is_actionable: { type: "boolean", description: "True if message contains a task, deadline, or urgent request" },
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
        tool_choice: { type: "function", function: { name: "analyze_messages" } },
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

    let analyses: AIAnalysis[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        analyses = parsed.analyses || [];
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    console.log(`AI returned ${analyses.length} analyses, ${analyses.filter((a: any) => a.is_actionable).length} actionable`);

    // Now generate nudge drafts for actionable messages
    const actionableAnalyses = analyses.filter((a: any) => a.is_actionable);
    let nudgeDrafts: Record<number, string> = {};

    if (actionableAnalyses.length > 0) {
      const nudgeResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `You are a polite workplace assistant. Generate context-aware follow-up nudge messages.
Each nudge should be friendly, professional, and reference the specific task/deadline.
Keep nudges to 1-2 sentences. Use the person's first name.`,
            },
            {
              role: "user",
              content: `Generate nudge messages for these actionable items:\n\n${JSON.stringify(
                actionableAnalyses.map((a: any) => ({
                  index: a.index,
                  sender: newMessages[a.index]?.employee_name,
                  task: a.task_summary,
                  deadline: a.deadline,
                  original: newMessages[a.index]?.original_message,
                }))
              )}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_nudges",
                description: "Return nudge drafts for each actionable message",
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

    // Store all results in DB (cache layer)
    const records = newMessages.map((msg, i) => {
      const analysis = analyses.find((a: any) => a.index === i) || { is_actionable: false };
      return {
        slack_message_ts: msg.timestamp,
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

    // Create follow-up entries for actionable items (T+2 days)
    const followupRecords = records
      .filter((r) => r.is_actionable)
      .map((r) => ({
        processed_message_id: undefined as any, // will be set after insert
        channel_id: r.channel_id,
        slack_message_ts: r.slack_message_ts,
        task_summary: r.task_summary || "Follow up on task",
        assignee: r.assignee,
        followup_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // T+2 days
        user_id: user.id,
        status: "pending",
      }));

    if (followupRecords.length > 0) {
      // Get the IDs of the just-inserted processed messages
      const { data: insertedMsgs } = await supabase
        .from("slack_processed_messages")
        .select("id, slack_message_ts")
        .eq("channel_id", channel_id)
        .eq("is_actionable", true)
        .eq("user_id", user.id)
        .in("slack_message_ts", followupRecords.map((r) => r.slack_message_ts));

      if (insertedMsgs) {
        const tsToId = Object.fromEntries(insertedMsgs.map((m: any) => [m.slack_message_ts, m.id]));
        const validFollowups = followupRecords
          .filter((r) => tsToId[r.slack_message_ts])
          .map((r) => ({
            ...r,
            processed_message_id: tsToId[r.slack_message_ts],
          }));

        if (validFollowups.length > 0) {
          // Check for existing followups to avoid duplicates
          const { data: existingFollowups } = await supabase
            .from("nudge_followups")
            .select("slack_message_ts")
            .eq("channel_id", channel_id)
            .in("slack_message_ts", validFollowups.map((r) => r.slack_message_ts));

          const existingFollowupTs = new Set((existingFollowups || []).map((f: any) => f.slack_message_ts));
          const newFollowups = validFollowups.filter((f) => !existingFollowupTs.has(f.slack_message_ts));

          if (newFollowups.length > 0) {
            await supabase.from("nudge_followups").insert(newFollowups);
            console.log(`Created ${newFollowups.length} follow-up entries`);
          }
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
        new_count: newMessages.length,
        actionable_count: actionableAnalyses.length,
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
