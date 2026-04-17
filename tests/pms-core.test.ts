import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkingDays,
  countWorkingDaysBetween,
  formatDate
} from "../lib/dates/working-days.ts";
import {
  buildWorkspaceToggleOptions,
  canUsePlayerCoachToggle,
  resolveWorkspaceSession
} from "../lib/auth/workspace-role.ts";
import { roleLabel } from "../lib/auth/roles.ts";
import { getLifecycleGuard } from "../lib/workflows/provisioning-service.ts";

test("addWorkingDays skips weekends", () => {
  const start = new Date("2026-04-17T00:00:00.000Z");
  const result = addWorkingDays(start, 1);

  assert.equal(formatDate(result), "20 Apr 2026");
});

test("countWorkingDaysBetween counts only business days", () => {
  const total = countWorkingDaysBetween(
    new Date("2026-04-13T00:00:00.000Z"),
    new Date("2026-04-20T00:00:00.000Z")
  );

  assert.equal(total, 5);
});

test("player-coach toggle is enabled only for employee-manager users", () => {
  assert.equal(
    canUsePlayerCoachToggle({
      userId: "u1",
      fullName: "Manager User",
      role: "manager",
      roles: ["employee", "manager"],
      email: "manager@example.com"
    }),
    true
  );

  assert.equal(
    canUsePlayerCoachToggle({
      userId: "u2",
      fullName: "Employee User",
      role: "employee",
      roles: ["employee"],
      email: "employee@example.com"
    }),
    false
  );
});

test("resolveWorkspaceSession only switches to allowed roles", () => {
  const session = {
    userId: "u1",
    fullName: "Player Coach",
    role: "manager" as const,
    roles: ["employee", "manager"] as const,
    email: "pc@example.com"
  };

  assert.equal(resolveWorkspaceSession(session, "employee").role, "employee");
  assert.equal(resolveWorkspaceSession(session, "admin").role, "manager");
});

test("buildWorkspaceToggleOptions preserves other query params", () => {
  const session = {
    userId: "u1",
    fullName: "Player Coach",
    role: "manager" as const,
    roles: ["employee", "manager"] as const,
    email: "pc@example.com"
  };

  const options = buildWorkspaceToggleOptions(session, "employee", "/dashboard", {
    tab: "pending",
    view: "employee"
  });

  assert.equal(options.length, 2);
  assert.equal(options[0]?.href, "/dashboard?tab=pending");
  assert.equal(options[1]?.href, "/dashboard?tab=pending&view=manager");
});

test("roleLabel returns the expected display text", () => {
  assert.equal(roleLabel("employee"), "Employee");
  assert.equal(roleLabel("manager"), "Manager");
  assert.equal(roleLabel("admin"), "Admin (HR)");
});

test("getLifecycleGuard blocks deactivation when ownership still exists", () => {
  const blocked = getLifecycleGuard({
    isActive: true,
    directReportCount: 1,
    activeReviewAssignments: 2,
    elevatedGoalCount: 0
  });

  assert.equal(blocked.canDeactivate, false);
  assert.match(blocked.lifecycleHint ?? "", /direct report/);
  assert.match(blocked.lifecycleHint ?? "", /acting review assignment/);

  const clear = getLifecycleGuard({
    isActive: true,
    directReportCount: 0,
    activeReviewAssignments: 0,
    elevatedGoalCount: 0
  });

  assert.equal(clear.canDeactivate, true);
});
