

# Integrating with Project Management Tools

## Overview

This plan adds a **universal task export** feature that lets you push AI-detected tasks or follow-ups directly into your project management tool of choice (Linear, Jira, Asana, or any tool with a webhook/API).

The approach uses a **provider-based architecture** -- you configure your tool once in Settings, and then a "Create Task" button appears on every action card and follow-up card.

## How It Works

1. Go to **Settings** and pick your PM tool (Linear, Jira, Asana, or Webhook)
2. Enter your API token (stored securely as a backend secret)
3. On any **Briefing card** or **Follow-up card**, click **"Create Task"**
4. The task is created in your PM tool with the summary, assignee, urgency, and deadline pre-filled
5. The card shows a linked badge so you know it's been exported

## Supported Tools

| Tool | API Type | What You Need |
|------|----------|---------------|
| **Linear** | GraphQL | API key from linear.app/settings/api |
| **Jira** | REST | Email + API token + your Jira domain |
| **Asana** | REST | Personal access token |
| **Custom Webhook** | POST | Any webhook URL (works with Zapier, Make, n8n, etc.) |

## User Experience

### Settings Page (new "Integrations" section)

- Dropdown to select your PM tool
- Input fields for credentials (varies per tool)
- A "Test Connection" button to verify setup
- Save button that stores credentials securely

### Briefing Page (AIActionCard)

- New **"Create Task"** button alongside "Dismiss" and "Send Nudge"
- After creation, shows a green "Linked" badge with the external task ID/URL
- Task is pre-filled with: summary, assignee, urgency label, and deadline

### Follow-ups Page (FollowupCard)

- New **"Create Task"** button in the action row
- Same behavior -- exports the follow-up as a task to your PM tool

---

## Technical Details

### 1. Database Changes

Add a new `integrations` table and an `external_task_id` column to existing tables:

```sql
-- Store PM tool configuration per user
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,        -- 'linear', 'jira', 'asana', 'webhook'
  config JSONB DEFAULT '{}',     -- domain, project_id, team_id, etc. (non-secret)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add external task tracking to processed messages
ALTER TABLE slack_processed_messages
  ADD COLUMN external_task_id TEXT,
  ADD COLUMN external_task_url TEXT;

-- Add external task tracking to follow-ups
ALTER TABLE nudge_followups
  ADD COLUMN external_task_id TEXT,
  ADD COLUMN external_task_url TEXT;
```

RLS policies will restrict integrations to the owning user.

API tokens/secrets are stored via backend secrets (not in the database).

### 2. New Edge Function: `create-external-task`

A single edge function that handles all providers:

- Reads the user's integration config from the `integrations` table
- Reads the API token from backend secrets (keyed per user/provider)
- Routes to the correct provider handler:
  - **Linear**: GraphQL mutation to `issueCreate`
  - **Jira**: REST POST to `/rest/api/3/issue`
  - **Asana**: REST POST to `/api/1.0/tasks`
  - **Webhook**: Simple POST with JSON payload
- Returns the created task ID and URL
- Updates `external_task_id` / `external_task_url` on the source record

### 3. New Hook: `useIntegration`

```
src/hooks/useIntegration.ts
```

- `useIntegration()` -- fetch user's current integration config
- `useUpdateIntegration()` -- save/update integration settings
- `useCreateExternalTask()` -- mutation to call the edge function
- `useTestConnection()` -- verify credentials work

### 4. Updated Components

**`src/components/AIActionCard.tsx`**
- Add a "Create Task" icon button (e.g., a clipboard/external-link icon)
- Show a "Linked" badge if `external_task_url` exists
- Clicking opens the task in a new tab if already linked

**`src/pages/Followups.tsx` (FollowupCard)**
- Same "Create Task" button added to the action row
- Same linked badge behavior

**`src/pages/Settings.tsx`**
- New "Integrations" card section below "Default Slack Channel"
- Provider selector dropdown
- Dynamic fields based on provider:
  - Linear: API key input
  - Jira: domain, email, API token inputs
  - Asana: personal access token input
  - Webhook: URL input
- "Test Connection" and "Save" buttons

### 5. File Summary

| File | Action |
|------|--------|
| `supabase/functions/create-external-task/index.ts` | New -- edge function for all providers |
| `src/hooks/useIntegration.ts` | New -- integration config + task creation hooks |
| `src/components/AIActionCard.tsx` | Edit -- add "Create Task" button + linked badge |
| `src/pages/Followups.tsx` | Edit -- add "Create Task" to FollowupCard |
| `src/pages/Settings.tsx` | Edit -- add Integrations section |
| `supabase/config.toml` | Edit -- register new edge function |
| Database migration | New -- `integrations` table + columns on existing tables |

### 6. Security

- API tokens are stored as backend secrets, never in the database
- The edge function authenticates the user before accessing their integration
- RLS on the `integrations` table ensures users can only see their own config
- External API calls happen server-side only (edge function), never from the browser

