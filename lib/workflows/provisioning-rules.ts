export function getLifecycleGuard(input: {
  isActive: boolean;
  directReportCount: number;
  activeReviewAssignments: number;
  elevatedGoalCount: number;
}) {
  if (!input.isActive) {
    return {
      canDeactivate: false,
      lifecycleHint: "Inactive users can be reactivated, not deactivated again."
    };
  }

  const blockers: string[] = [];

  if (input.directReportCount > 0) {
    blockers.push(`${input.directReportCount} direct report(s)`);
  }

  if (input.activeReviewAssignments > 0) {
    blockers.push(`${input.activeReviewAssignments} acting review assignment(s)`);
  }

  if (input.elevatedGoalCount > 0) {
    blockers.push(`${input.elevatedGoalCount} team/company goal(s)`);
  }

  if (blockers.length === 0) {
    return {
      canDeactivate: true,
      lifecycleHint: "Safe to deactivate if the account should no longer access PMS."
    };
  }

  return {
    canDeactivate: false,
    lifecycleHint: `Transfer ${blockers.join(", ")} before deactivation.`
  };
}
