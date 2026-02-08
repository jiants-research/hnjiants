import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) {
      throw new Error("SLACK_BOT_TOKEN is not configured");
    }

    const res = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=100",
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();
    console.log("Slack API response:", JSON.stringify({ ok: data.ok, error: data.error, needed: data.needed, provided: data.provided }));

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}. Needed: ${data.needed || 'unknown'}. Provided: ${data.provided || 'unknown'}`);
    }

    const channels = data.channels.map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      is_private: ch.is_private,
      num_members: ch.num_members,
    }));

    return new Response(JSON.stringify({ channels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error listing Slack channels:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
