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

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    if (action === "list") {
      // Return pending followups that are due
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

      await supabase
        .from("nudge_followups")
        .update({ status: "resolved" })
        .eq("id", followup_id)
        .eq("user_id", user.id);

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

      // Get followup details
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

      // Generate a secondary reminder via AI
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
