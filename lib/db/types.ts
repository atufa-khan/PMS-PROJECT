export type UUID = string;

export type GoalStatus =
  | "draft"
  | "pending_approval"
  | "active"
  | "completed"
  | "archived";

export type GoalScope = "company" | "team" | "individual";

export type DashboardMetric = {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warn";
  detail?: string;
};

export type GoalRecord = {
  id: UUID;
  title: string;
  scope: GoalScope;
  status: GoalStatus;
  ownerId?: UUID | null;
  ownerName: string;
  dueLabel: string;
  weightage: number;
  completionPct: number;
  canSubmit?: boolean;
  canUpdateProgress?: boolean;
  canArchive?: boolean;
};

export type ProbationCheckpointRecord = {
  id: UUID;
  employeeId?: UUID | null;
  employeeName: string;
  dayLabel: string;
  dueDate: string;
  status: string;
  waitingOn: string;
};

export type ApprovalRecord = {
  id: UUID;
  goalId?: UUID;
  goalTitle: string;
  requestedBy: string;
  submittedAt: string;
  status: string;
  scope?: GoalScope;
  weightage?: number;
  canApprove?: boolean;
};
