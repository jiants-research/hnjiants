import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SlackMessage {
  user: string;
  text: string;
  ts: string;
  channel?: string;
}

interface SlackUser {
  id: string;
  real_name: string;
  profile: {
    display_name: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) {
      throw new Error("SLACK_BOT_TOKEN is not configured");
    }

    const { channel_id, limit = 20 } = await req.json();

    if (!channel_id) {
      throw new Error("channel_id is required");
    }

    // Fetch messages from the channel
    const messagesRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${channel_id}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const messagesData = await messagesRes.json();

    if (!messagesData.ok) {
      throw new Error(`Slack API error: ${messagesData.error}`);
    }

    // Collect unique user IDs
    const userIds = [...new Set(messagesData.messages.map((m: SlackMessage) => m.user).filter(Boolean))];

    // Fetch user info for all unique users
    const usersMap: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (userId: string) => {
        const userRes = await fetch(
          `https://slack.com/api/users.info?user=${userId}`,
          {
            headers: {
              Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            },
          }
        );
        const userData = await userRes.json();
        if (userData.ok) {
          const u = userData.user as SlackUser;
          usersMap[userId] = u.real_name || u.profile.display_name || userId;
        }
      })
    );

    // Format messages for the frontend
    const formattedMessages = messagesData.messages
      .filter((m: SlackMessage) => m.user && m.text)
      .map((m: SlackMessage) => ({
        slack_user_id: m.user,
        employee_name: usersMap[m.user] || m.user,
        original_message: m.text,
        timestamp: m.ts,
        channel: channel_id,
      }));

    return new Response(JSON.stringify({ messages: formattedMessages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error fetching Slack messages:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
