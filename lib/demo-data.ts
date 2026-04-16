import type { AppSession } from "@/lib/auth/session";
import type {
  ApprovalRecord,
  DashboardMetric,
  GoalRecord,
  ProbationCheckpointRecord
} from "@/lib/db/types";

const sessions: AppSession[] = [
  {
    userId: "8f57ae3e-ff14-4c64-bf9f-1cc2576d7cb3",
    fullName: "Aarav Shah",
    role: "admin",
    roles: ["admin"],
    email: "aarav.shah@pms.local"
  },
  {
    userId: "7f83686a-3a66-4876-b564-10d7cdd74c11",
    fullName: "Neha Rao",
    role: "manager",
    roles: ["manager", "employee"],
    email: "neha.rao@pms.local"
  },
  {
    userId: "6f3c1130-93f3-47ff-8664-6474ac48a637",
    fullName: "Ishita Gupta",
    role: "employee",
    roles: ["employee"],
    email: "ishita.gupta@pms.local"
  }
];

export function getDemoSession(): AppSession {
  return sessions[0];
}

export function getDashboardMetrics(role: AppSession["role"]): DashboardMetric[] {
  if (role === "employee") {
    return [
      { label: "Active goals", value: "4", detail: "1 pending approval" },
      { label: "Goal completion", value: "78%", tone: "accent" },
      { label: "Probation checkpoint", value: "Day 60 due in 4d" },
      { label: "Open feedback items", value: "2", tone: "warn" }
    ];
  }

  if (role === "manager") {
    return [
      { label: "Pending approvals", value: "7", tone: "warn" },
      { label: "Team completion", value: "81%", tone: "accent" },
      { label: "Overdue forms", value: "3" },
      { label: "Discussion slots", value: "5 upcoming" }
    ];
  }

  return [
    { label: "Submission compliance", value: "87%", tone: "accent" },
    { label: "Open flags", value: "6", tone: "warn", detail: "2 aging > 7 days" },
    { label: "Probation cases", value: "14 active" },
    { label: "Goal approval SLA", value: "4.1 days" }
  ];
}

export function getGoals(): GoalRecord[] {
  return [
    {
      id: "4f0cb2df-4913-4ff0-9d32-3a887e2c0a48",
      title: "Launch structured onboarding goals for all new hires",
      scope: "company",
      status: "active",
      ownerName: "Aarav Shah",
      dueLabel: "Aug 25",
      weightage: 20,
      completionPct: 55,
      rating: "Below Expectations",
      portfolioWeightage: 100,
      portfolioRemaining: 0
    },
    {
      id: "9df4dbdf-f63e-4207-b7c9-d0e309892f63",
      title: "Reduce probation form delays below 10%",
      scope: "team",
      status: "active",
      ownerName: "Neha Rao",
      dueLabel: "Aug 25",
      weightage: 30,
      completionPct: 72,
      rating: "Meets Expectations",
      portfolioWeightage: 100,
      portfolioRemaining: 0
    },
    {
      id: "3ce506cf-7572-44b4-bb2d-dfd3aa841478",
      title: "Automate manager nudges for pending reviews",
      scope: "individual",
      status: "pending_approval",
      ownerName: "Ishita Gupta",
      dueLabel: "Sep 10",
      weightage: 25,
      completionPct: 10,
      rating: "Below Expectations",
      portfolioWeightage: 100,
      portfolioRemaining: 0
    },
    {
      id: "c36a0ccb-09f9-4bb6-b92e-8e72893e0f63",
      title: "Improve team goal coverage in first 30 days",
      scope: "individual",
      status: "active",
      ownerName: "Ishita Gupta",
      dueLabel: "Aug 25",
      weightage: 25,
      completionPct: 93,
      rating: "Meets Expectations",
      portfolioWeightage: 100,
      portfolioRemaining: 0
    }
  ];
}

export function getApprovals(): ApprovalRecord[] {
  return [
    {
      id: "c7bd4c89-c37d-4bc7-bf42-2fe80c7473f2",
      goalTitle: "Automate manager nudges for pending reviews",
      requestedBy: "Ishita Gupta",
      submittedAt: "2026-04-12",
      status: "Pending approval"
    },
    {
      id: "e2f4aa39-29f0-4cdc-bdb2-b15cca594dc2",
      goalTitle: "Create a repeat-flag weekly digest",
      requestedBy: "Rohan Mehta",
      submittedAt: "2026-04-11",
      status: "Escalates in 2 business days"
    }
  ];
}

export function getProbationCheckpoints(): ProbationCheckpointRecord[] {
  return [
    {
      id: "56374ed0-1ae4-4a63-aa40-d2c2504041c7",
      employeeName: "Ishita Gupta",
      dayLabel: "Day 60",
      dueDate: "2026-04-20",
      status: "In progress",
      waitingOn: "Manager feedback"
    },
    {
      id: "43db6771-f3c6-4fce-aa1e-07c0a97149e0",
      employeeName: "Rohan Mehta",
      dayLabel: "Day 30",
      dueDate: "2026-04-17",
      status: "Blocked",
      waitingOn: "Manager assignment"
    },
    {
      id: "fc9f44a5-443f-4e08-8302-942dc728bf89",
      employeeName: "Ananya Singh",
      dayLabel: "Day 80",
      dueDate: "2026-04-18",
      status: "Paused",
      waitingOn: "Employee on leave"
    }
  ];
}
