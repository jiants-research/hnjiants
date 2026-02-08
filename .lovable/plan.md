

# Fix Nudge Persistence, Real Team Pulse, Follow-up Logic, and User Settings

## 1. Fix: Nudges Reappearing After Refresh

**Problem**: When you send a nudge, the card disappears (local state), but on page refresh the same messages reappear because `nudge_sent` is never updated in the database.

**Solution**: After successfully sending a nudge via Slack, immediately update the `slack_processed_messages` record to set `nudge_sent = true` and `nudge_sent_at = now()`. Then invalidate the React Query cache so the UI stays in sync.

**Files to change**:
- `src/pages/Briefing.tsx` — update `handleSendAINudge` to call a database update after sending, then invalidate the `analyzed-messages` query
- `src/hooks/useNudgeAnalysis.ts` — add a `useMarkNudgeSent` mutation hook that updates the database record and invalidates relevant queries

---

## 2. Fix: Follow-ups Created Only on "Send Nudge"

**Problem**: Follow-up entries are currently created during the AI analysis step (before the user decides anything). The correct workflow is: AI identifies task, user reviews it, user clicks "Send Nudge", and only then is the follow-up scheduled.

**Solution**:
- Remove follow-up creation from the `analyze-slack-messages` Edge Function (Step 6)
- Move follow-up creation into a new flow triggered when the user clicks "Send Nudge"
- The follow-up timing is determined by the task's urgency level (critical: 4h, high: 1d, medium: 2d, low: 5d) — this logic stays the same but fires at the right moment

**Files to change**:
- `supabase/functions/analyze-slack-messages/index.ts` — remove Step 6 (lines 327-369) that auto-creates follow-ups
- `src/hooks/useNudgeAnalysis.ts` — create a `useCreateFollowup` mutation that inserts a follow-up record with the urgency-based delay
- `src/pages/Briefing.tsx` — update `handleSendAINudge` to: (1) send Slack message, (2) mark nudge as sent in DB, (3) create follow-up entry, (4) invalidate queries

---

## 3. Real Team Pulse Statistics

**Problem**: The Team Pulse page shows hardcoded mock data instead of real statistics from the database.

**Solution**: Replace mock data with real queries against `slack_processed_messages` and `nudge_followups`. The leaderboard will aggregate data by assignee, counting open loops (actionable + not nudge_sent) and calculating a reliability score based on resolved vs total follow-ups.

**Files to change**:
- `src/pages/TeamPulse.tsx` — replace `mockTeamMembers` import with a real database query hook
- `src/hooks/useTeamPulse.ts` (new) — hook that queries `slack_processed_messages` and `nudge_followups` to compute per-assignee stats:
  - Open loops = actionable messages where nudge has not been sent
  - Total tasks = all actionable messages assigned to them
  - Resolved count = follow-ups marked as resolved
  - Reliability score = (resolved / total) * 100

---

## 4. User Settings Page with Profile Picture

**Problem**: There is no settings section, and the user's profile picture is not displayed anywhere.

**Solution**: Create a new `/settings` route and page. Display the user's Google profile picture (from auth metadata `avatar_url`) or fall back to initials generated from their name/email. Also add a small avatar in the app header for quick access to settings.

**Files to change**:
- `src/pages/Settings.tsx` (new) — settings page showing:
  - User avatar (Google picture or initials fallback)
  - Full name and email
  - Default channel preference
  - Sign out button
- `src/App.tsx` — add `/settings` route
- `src/components/BottomNav.tsx` — add Settings nav item (or use the header avatar as a link)
- `src/components/Layout.tsx` — replace the sign-out button with an avatar that links to settings
- `src/hooks/useProfile.ts` (new) — hook to fetch and update the user's profile from the `profiles` table, including syncing `avatar_url` from Google auth metadata

---

## 5. Database Cleanup

Clear stale records created by the old auto-follow-up logic so the system starts fresh with the corrected workflow:
- Delete all records from `nudge_followups`
- Delete all records from `slack_processed_messages`

---

## Technical Details

### Updated Nudge Flow (Steps 2 + 1 combined)

```text
AI Analysis (Edge Function)           User Action (Frontend)
+--------------------------+          +----------------------------+
| 1. Group messages        |          | 1. User clicks "Send      |
| 2. Deduplicate           |          |    Nudge"                  |
| 3. Analyze with OpenAI   |          | 2. Send Slack message      |
| 4. Generate nudge drafts |          | 3. Update DB: nudge_sent   |
| 5. Store in DB           |          |    = true                  |
|    (NO follow-up created)|          | 4. Create follow-up with   |
+--------------------------+          |    urgency-based delay     |
                                      | 5. Invalidate queries      |
                                      +----------------------------+
```

### Team Pulse Query Logic

```sql
-- Per-assignee stats from slack_processed_messages
SELECT 
  assignee,
  COUNT(*) FILTER (WHERE is_actionable) as total_tasks,
  COUNT(*) FILTER (WHERE is_actionable AND NOT nudge_sent) as open_loops
FROM slack_processed_messages
WHERE user_id = :current_user
GROUP BY assignee;

-- Per-assignee resolved count from nudge_followups  
SELECT 
  assignee,
  COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
  COUNT(*) as total_followups
FROM nudge_followups
WHERE user_id = :current_user
GROUP BY assignee;
```

### Profile Avatar Logic

```text
1. Check user.user_metadata.avatar_url (set by Google OAuth)
2. If available -> display as image
3. If not -> generate initials from full_name or email
4. Sync avatar_url to profiles table on login
```

### New Files Summary

| File | Purpose |
|------|---------|
| `src/hooks/useTeamPulse.ts` | Real team stats from DB |
| `src/hooks/useProfile.ts` | User profile data + avatar |
| `src/pages/Settings.tsx` | User settings page |

### Modified Files Summary

| File | Changes |
|------|---------|
| `src/pages/Briefing.tsx` | Fix nudge send flow (mark sent + create follow-up) |
| `src/hooks/useNudgeAnalysis.ts` | Add `useMarkNudgeSent` and `useCreateFollowup` mutations |
| `src/pages/TeamPulse.tsx` | Replace mock data with real queries |
| `src/components/Layout.tsx` | Add user avatar in header |
| `src/components/BottomNav.tsx` | Add Settings nav item |
| `src/App.tsx` | Add `/settings` route |
| `supabase/functions/analyze-slack-messages/index.ts` | Remove auto follow-up creation |

