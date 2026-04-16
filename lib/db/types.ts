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
  href?: string;
};

export type GoalRecord = {
  id: UUID;
  title: string;
  scope: GoalScope;
  status: GoalStatus;
  ownerId?: UUID | null;
  ownerName: string;
  dueLabel: string;
  cycleId?: UUID | null;
  teamId?: UUID | null;
  description?: string | null;
  successMetric?: string | null;
  weightage: number;
  completionPct: number;
  rating: "Below Expectations" | "Meets Expectations" | "Above Expectations";
  portfolioWeightage: number;
  portfolioRemaining: number;
  approvalSlaLabel?: string;
  canSubmit?: boolean;
  canUpdateProgress?: boolean;
  canArchive?: boolean;
  canEdit?: boolean;
  hasPendingSuggestion?: boolean;
  suggestionContext?: string | null;
  canAcknowledgeSuggestion?: boolean;
};

export type GoalWeightageContextRecord = {
  scope: GoalScope;
  assignedTotal: number;
  remaining: number;
};

export type GoalOwnerOptionRecord = {
  id: UUID;
  fullName: string;
  email: string;
  teamName?: string | null;
};

export type DashboardListItem = {
  id: string;
  title: string;
  subtitle: string;
  detail?: string;
  tone?: "default" | "accent" | "warn";
  href?: string;
};

export type DashboardDetail = {
  primaryTitle: string;
  primaryDescription: string;
  primaryItems: DashboardListItem[];
  secondaryTitle: string;
  secondaryDescription: string;
  secondaryItems: DashboardListItem[];
  adminCatchUp?: {
    title: string;
    description: string;
    items: DashboardListItem[];
    canAcknowledge: boolean;
  };
};

export type ProbationCheckpointRecord = {
  id: UUID;
  caseId?: UUID | null;
  employeeId?: UUID | null;
  employeeName: string;
  managerName?: string | null;
  dayLabel: string;
  dueDate: string;
  status: string;
  waitingOn: string;
  employeeSubmitted?: boolean;
  managerSubmitted?: boolean;
  canSubmitFeedback?: boolean;
  myPendingRequestId?: UUID | null;
  pendingRole?: "employee" | "manager" | null;
};

export type ProbationCaseRecord = {
  id: UUID;
  employeeId: UUID;
  employeeName: string;
  managerName: string;
  status: string;
  discussionStatus: string;
  discussionAt: string;
  adminBriefingNote: string;
  pendingCheckpoints: number;
  latestDecision?: string;
  latestDecisionDate?: string;
  missingManager?: boolean;
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
  assignedTotal?: number;
  remaining?: number;
  canApprove?: boolean;
};

export type ReviewCycleRecord = {
  id: UUID;
  name: string;
  cycleType: "biannual" | "quarterly";
  windowLabel: string;
  closeDate: string;
  isActive: boolean;
  enrollmentCount: number;
  completedCount: number;
  myStatus: string;
  actionRequired: boolean;
};

export type ReviewEnrollmentRecord = {
  id: UUID;
  employeeId: UUID;
  employeeName: string;
  reviewerName: string;
  reviewerEmail?: string | null;
  discussionStatus: string;
  discussionDate: string;
  reviewStatus: string;
  eligibilityNote: string;
  selfRating: string;
  selfSummary: string;
  managerRating: string;
  managerSummary: string;
  visibleSelfSummary: string;
  visibleManagerSummary: string;
  crossShareStatus: string;
  goalCount: number;
  goalRequirementNote: string;
  hasEmployeeSubmission: boolean;
  hasManagerSubmission: boolean;
  canSubmitSelf: boolean;
  canSubmitManager: boolean;
  canScheduleDiscussion: boolean;
  canCompleteDiscussion: boolean;
  canFinalize: boolean;
  canWaive: boolean;
  canReassignReviewer: boolean;
};

export type FlagRecord = {
  id: UUID;
  employeeName: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  status: "open" | "in_review" | "resolved" | "escalated";
  createdAt: string;
  ageLabel: string;
  isRepeatFlag: boolean;
  latestActionNote: string;
  actionCount: number;
  canReview: boolean;
  canResolve: boolean;
  canEscalate: boolean;
  workflowLabel?: string;
  currentContext?: string | null;
  previousContext?: string | null;
  repeatContext?: string | null;
};
