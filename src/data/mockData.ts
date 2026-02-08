import { subHours, subDays, addMinutes } from 'date-fns';

export interface OpenLoop {
  id: string;
  employee_name: string;
  channel: string;
  original_message: string;
  due_date: string;
  status: 'overdue' | 'due_soon' | 'on_track';
  ai_draft_response: string;
}

export interface TeamMember {
  id: string;
  name: string;
  open_loops: number;
  reliability_score: number;
  role: string;
}

const now = new Date();

export const mockOpenLoops: OpenLoop[] = [
  {
    id: '1',
    employee_name: 'Sarah Chen',
    channel: 'design',
    original_message: "I'll have the design mockups ready by Friday 5 PM",
    due_date: subHours(now, 4).toISOString(),
    status: 'overdue',
    ai_draft_response: 'Hey Sarah, gentle bump on the design mockups. Are they ready for review?',
  },
  {
    id: '2',
    employee_name: 'Marcus Johnson',
    channel: 'sales',
    original_message: "Client proposal will be sent out by end of day",
    due_date: subHours(now, 18).toISOString(),
    status: 'overdue',
    ai_draft_response: "Hey Marcus, checking in on the client proposal — what's the latest?",
  },
  {
    id: '3',
    employee_name: 'Priya Patel',
    channel: 'engineering',
    original_message: "Bug fix for the checkout flow will be deployed by noon today",
    due_date: subHours(now, 2).toISOString(),
    status: 'overdue',
    ai_draft_response: 'Hey Priya, the checkout bug fix was due at noon — is it deployed yet?',
  },
  {
    id: '4',
    employee_name: 'Alex Rivera',
    channel: 'ops',
    original_message: "I'll schedule the team retrospective by tomorrow morning",
    due_date: addMinutes(now, 45).toISOString(),
    status: 'due_soon',
    ai_draft_response: "Hey Alex, just a heads up — the retro scheduling is coming up soon. All set?",
  },
  {
    id: '5',
    employee_name: 'Jordan Kim',
    channel: 'finance',
    original_message: "The Q4 financial report will be on your desk by Wednesday",
    due_date: subDays(now, 1).toISOString(),
    status: 'overdue',
    ai_draft_response: 'Hey Jordan, the Q4 report was due yesterday — can you send it over?',
  },
];

export const mockTeamMembers: TeamMember[] = [
  { id: '1', name: 'Alex Rivera', open_loops: 0, reliability_score: 98, role: 'Operations Lead' },
  { id: '2', name: 'Sarah Chen', open_loops: 2, reliability_score: 94, role: 'Design Lead' },
  { id: '3', name: 'Jordan Kim', open_loops: 1, reliability_score: 91, role: 'Finance Manager' },
  { id: '4', name: 'Marcus Johnson', open_loops: 1, reliability_score: 87, role: 'Sales Director' },
  { id: '5', name: 'Priya Patel', open_loops: 3, reliability_score: 72, role: 'Senior Engineer' },
];
