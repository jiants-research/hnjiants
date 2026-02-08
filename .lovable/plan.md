
# Full Linear Integration — Bidirectional Sync

## Overview

This upgrades the Linear integration from a simple "create task" button to a **fully bidirectional sync**:

1. **During Slack analysis**: The AI checks Linear for existing matching issues before creating new ones
2. **Auto-create**: If no match is found, the task is automatically created in Linear (no manual button needed)
3. **Resolve syncs back**: When the boss clicks "Resolved" on a follow-up, the corresponding Linear issue is also marked as Done

The Settings page is simplified to Linear-only since that's the only tool in use.

---

## What Changes

### 1. Slack Analysis Now Checks Linear First

When the `analyze-slack-messages` edge function detects actionable tasks, it will:

- Query Linear's GraphQL API to search for existing issues matching the task summary (using title/text filter)
- If a match is found, link the existing issue (store its ID + URL) instead of creating a duplicate
- If no match is found, auto-create the issue in Linear immediately

This means tasks are **automatically synced to Linear** as soon as they're detected — no manual "Create Task" button needed.

### 2. Resolving a Follow-up Closes the Linear Issue

When clicking "Resolved" on any follow-up card:

- The `check-followups` edge function will look up the `external_task_id` on the follow-up (or its linked processed message)
- If a Linear issue is linked, it calls Linear's `issueUpdate` mutation to move the issue to the team's "Done" workflow state
- The workflow state ID for "Done" is fetched dynamically using the `workflowStates` query filtered by the team

### 3. Settings Simplified to Linear-Only

Since we're operating exclusively with Linear:
- Remove the multi-provider selector grid (Jira, Asana, Webhook options)
- Show a clean, focused Linear configuration card with just API Key and Team ID fields
- Keep the Test Connection and Disconnect functionality

### 4. UI Updates

- The `CreateTaskButton` on Briefing cards becomes a **status indicator** — it shows "Linked" badges automatically since tasks are auto-created during analysis
- Follow-up cards show the linked Linear issue badge
- The manual "Create Task" button remains as a fallback for edge cases where auto-creation was skipped

---

## Technical Details

### Edge Function: `analyze-slack-messages` (Modified)

After the AI produces its analysis, a new step runs before storing results:

1. Fetch the user's Linear integration config (API token + team_id) from the `integrations` table
2. For each actionable item, search Linear for matching issues:
   ```graphql
   query {
     issueSearch(query: "task summary text", first: 5) {
       nodes { id identifier url title state { name } }
     }
   }
   ```
3. If a match is found (fuzzy title match above a confidence threshold), store the `external_task_id` and `external_task_url` on the processed message record
4. If no match, create a new issue using the existing `createLinearIssue` logic (moved/shared from `create-external-task`)
5. Store the new issue's ID and URL on the record

### Edge Function: `check-followups` (Modified)

The `resolve` action gains a new step:

1. After marking the follow-up as "resolved" in the database, check if `external_task_id` exists
2. If it does, fetch the user's Linear integration config
3. Query Linear for the team's "Done" workflow state:
   ```graphql
   query {
     workflowStates(filter: { team: { id: { eq: "TEAM_ID" } }, type: { eq: "completed" } }) {
       nodes { id name }
     }
   }
   ```
4. Update the Linear issue to the Done state:
   ```graphql
   mutation {
     issueUpdate(id: "ISSUE_ID", input: { stateId: "DONE_STATE_ID" }) {
       success
       issue { id state { name } }
     }
   }
   ```

### Edge Function: `create-external-task` (Simplified)

- Strip out Jira, Asana, and Webhook provider handlers
- Keep only the Linear handler as the sole provider
- Keep `test` action for the Settings page connection test

### Component: `IntegrationSettings.tsx` (Simplified)

- Remove the 4-provider grid selector
- Show a single, clean Linear configuration form:
  - API Key input (password field)
  - Team ID input
  - Link to get Linear API key
- Keep Save, Test Connection, and Disconnect buttons

### Component: `AIActionCard.tsx` (Updated)

- The `CreateTaskButton` now primarily serves as a status indicator showing the linked Linear issue
- Since tasks are auto-created during analysis, most cards will already show a "Linked" badge with the Linear issue identifier (e.g., "ENG-42") that opens the issue in Linear when clicked

### Hook: `useIntegration.ts` (Simplified)

- Remove multi-provider type — only `'linear'` provider
- Keep the same query/mutation patterns

### File Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/analyze-slack-messages/index.ts` | Edit | Add Linear search + auto-create after AI analysis |
| `supabase/functions/check-followups/index.ts` | Edit | Add Linear issue completion on resolve |
| `supabase/functions/create-external-task/index.ts` | Edit | Simplify to Linear-only, keep test action |
| `src/components/IntegrationSettings.tsx` | Edit | Simplify to Linear-only form |
| `src/hooks/useIntegration.ts` | Edit | Simplify types to Linear-only |
| `src/components/CreateTaskButton.tsx` | Minor | No major changes — works as-is for status display |

### No Database Changes Required

The existing `integrations` table and `external_task_id`/`external_task_url` columns on `slack_processed_messages` and `nudge_followups` already support everything needed.
