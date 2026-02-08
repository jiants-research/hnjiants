import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SlackMessage {
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
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

    const { channel_id, limit = 30 } = await req.json();

    if (!channel_id) {
      throw new Error("channel_id is required");
    }

    const headers = {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    };

    // Fetch top-level messages from the channel
    const messagesRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${channel_id}&limit=${limit}`,
      { headers }
    );

    const messagesData = await messagesRes.json();

    if (!messagesData.ok) {
      throw new Error(`Slack API error: ${messagesData.error}`);
    }

    const topLevelMessages: SlackMessage[] = messagesData.messages || [];

    // Identify threaded messages (those with replies)
    const threadedMessages = topLevelMessages.filter(
      (m: SlackMessage) => m.reply_count && m.reply_count > 0 && m.ts
    );

    // Track which top-level messages are thread parents
    const threadParentTs = new Set(threadedMessages.map((m: SlackMessage) => m.ts));

    // Fetch thread replies in parallel (limit to 10 threads to avoid rate limits)
    const threadsToFetch = threadedMessages.slice(0, 10);
    const threadReplies: SlackMessage[] = [];

    if (threadsToFetch.length > 0) {
      console.log(`Fetching replies for ${threadsToFetch.length} threads`);

      const threadResults = await Promise.allSettled(
        threadsToFetch.map(async (parent: SlackMessage) => {
          const repliesRes = await fetch(
            `https://slack.com/api/conversations.replies?channel=${channel_id}&ts=${parent.ts}&limit=20`,
            { headers }
          );
          const repliesData = await repliesRes.json();
          if (repliesData.ok) {
            // Exclude the parent message itself (first reply is the parent)
            return (repliesData.messages || [])
              .slice(1)
              .map((r: SlackMessage) => ({ ...r, thread_ts: parent.ts }));
          }
          return [];
        })
      );

      for (const result of threadResults) {
        if (result.status === "fulfilled") {
          threadReplies.push(...result.value);
        }
      }

      console.log(`Fetched ${threadReplies.length} thread replies`);
    }

    // Tag parent messages that have threads with their own ts as thread_ts
    const taggedTopLevel = topLevelMessages.map((m: SlackMessage) => ({
      ...m,
      thread_ts: threadParentTs.has(m.ts) ? m.ts : undefined,
    }));

    // Combine top-level messages and thread replies
    const allMessages = [...taggedTopLevel, ...threadReplies];

    // Collect unique user IDs
    const userIds = [
      ...new Set(allMessages.map((m: SlackMessage) => m.user).filter(Boolean)),
    ];

    // Fetch user info for all unique users
    const usersMap: Record<string, string> = {};
    await Promise.all(
      userIds.map(async (userId: string) => {
        const userRes = await fetch(
          `https://slack.com/api/users.info?user=${userId}`,
          { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
        );
        const userData = await userRes.json();
        if (userData.ok) {
          const u = userData.user as SlackUser;
          usersMap[userId] = u.real_name || u.profile.display_name || userId;
        }
      })
    );

    // Format messages for the frontend
    const formattedMessages = allMessages
      .filter((m: SlackMessage) => m.user && m.text)
      .map((m: SlackMessage) => ({
        slack_user_id: m.user,
        employee_name: usersMap[m.user] || m.user,
        original_message: m.text,
        timestamp: m.ts,
        channel: channel_id,
        thread_ts: m.thread_ts || null,
      }));

    console.log(
      `Returning ${formattedMessages.length} messages (${topLevelMessages.length} top-level, ${threadReplies.length} thread replies)`
    );

    return new Response(JSON.stringify({ messages: formattedMessages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error fetching Slack messages:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
