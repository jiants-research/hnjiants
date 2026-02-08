import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    // Get the user's Google access token from the request
    const { google_access_token, max_results = 15, query = "" } = await req.json();

    if (!google_access_token) {
      throw new Error("google_access_token is required. Sign in with Google to provide it.");
    }

    // Build Gmail API URL
    const params = new URLSearchParams({
      maxResults: String(max_results),
      labelIds: "INBOX",
    });
    if (query) {
      params.set("q", query);
    }

    // Fetch message list
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      {
        headers: {
          Authorization: `Bearer ${google_access_token}`,
        },
      }
    );

    if (!listRes.ok) {
      const errBody = await listRes.text();
      console.error("Gmail list error:", listRes.status, errBody);
      throw new Error(`Gmail API error (${listRes.status}): ${errBody}`);
    }

    const listData = await listRes.json();
    const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);

    if (messageIds.length === 0) {
      return new Response(JSON.stringify({ emails: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch each message's metadata (batch via Promise.all)
    const emails = await Promise.all(
      messageIds.map(async (id: string) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: {
              Authorization: `Bearer ${google_access_token}`,
            },
          }
        );

        if (!msgRes.ok) {
          console.error(`Failed to fetch message ${id}:`, msgRes.status);
          return null;
        }

        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];

        const getHeader = (name: string) =>
          headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        return {
          id: msgData.id,
          thread_id: msgData.threadId,
          snippet: msgData.snippet,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          label_ids: msgData.labelIds || [],
        };
      })
    );

    const validEmails = emails.filter(Boolean);

    console.log(`Fetched ${validEmails.length} emails from Gmail`);

    return new Response(JSON.stringify({ emails: validEmails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error fetching Gmail:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
