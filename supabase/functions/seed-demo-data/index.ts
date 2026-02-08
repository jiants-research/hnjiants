import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEMO_LOOPS = [
  {
    employee_name: "Sarah Chen",
    original_message: "I'll have the Q4 design mockups ready by end of day Wednesday.",
    due_date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    status: "overdue",
    ai_draft_response: "Hey Sarah, gentle bump on the Q4 design mockups. Are they ready?",
    channel: "design",
  },
  {
    employee_name: "Marcus Rivera",
    original_message: "The client proposal for Acme Corp will be on your desk by Friday 3 PM.",
    due_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: "overdue",
    ai_draft_response: "Hi Marcus, just following up on the Acme Corp proposal. What's the status?",
    channel: "sales",
  },
  {
    employee_name: "Priya Patel",
    original_message: "I'll push the bug fix for the checkout flow by tomorrow morning.",
    due_date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    status: "on_track",
    ai_draft_response: "Hey Priya, checking in on the checkout bug fix. Still on track for tomorrow AM?",
    channel: "engineering",
  },
  {
    employee_name: "James Wright",
    original_message: "The competitor analysis report will be done before our Monday standup.",
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "on_track",
    ai_draft_response: "Hi James, how's the competitor analysis coming along? Need any support?",
    channel: "strategy",
  },
  {
    employee_name: "Elena Vasquez",
    original_message: "I'll finalize the onboarding deck and send it to HR by Thursday noon.",
    due_date: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    status: "overdue",
    ai_draft_response: "Hey Elena, the onboarding deck was due earlier today. Is it ready to send to HR?",
    channel: "people-ops",
  },
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already has loops
    const { data: existingLoops } = await supabase
      .from("open_loops")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (existingLoops && existingLoops.length > 0) {
      return new Response(JSON.stringify({ message: "Demo data already exists" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert demo data
    const loopsWithUser = DEMO_LOOPS.map((loop) => ({
      ...loop,
      user_id: user.id,
    }));

    const { error: insertError } = await supabase
      .from("open_loops")
      .insert(loopsWithUser);

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ message: "Demo data seeded" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
