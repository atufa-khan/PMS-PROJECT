import assert from "node:assert/strict";
import process from "node:process";
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
import { getLifecycleGuard } from "../lib/workflows/provisioning-rules.ts";
import {
  getReadinessLabel,
  getReadinessState
} from "../lib/workflows/readiness-rules.ts";
import { toCsv } from "../lib/reports/csv.ts";

const results = [];

async function run(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

await run("addWorkingDays skips weekends", () => {
  const start = new Date("2026-04-17T00:00:00.000Z");
  const result = addWorkingDays(start, 1);
  assert.equal(formatDate(result), "20 Apr 2026");
});

await run("countWorkingDaysBetween counts only business days", () => {
  const total = countWorkingDaysBetween(
    new Date("2026-04-13T00:00:00.000Z"),
    new Date("2026-04-20T00:00:00.000Z")
  );
  assert.equal(total, 5);
});

await run("player-coach toggle only enables for employee-manager users", () => {
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

await run("resolveWorkspaceSession only switches to allowed roles", () => {
  const session = {
    userId: "u1",
    fullName: "Player Coach",
    role: "manager",
    roles: ["employee", "manager"],
    email: "pc@example.com"
  };

  assert.equal(resolveWorkspaceSession(session, "employee").role, "employee");
  assert.equal(resolveWorkspaceSession(session, "admin").role, "manager");
});

await run("buildWorkspaceToggleOptions preserves non-view query params", () => {
  const session = {
    userId: "u1",
    fullName: "Player Coach",
    role: "manager",
    roles: ["employee", "manager"],
    email: "pc@example.com"
  };

  const options = buildWorkspaceToggleOptions(session, "employee", "/dashboard", {
    tab: "pending",
    view: "employee"
  });

  assert.equal(options.length, 2);
  assert.equal(options[0]?.href, "/dashboard?tab=pending&view=employee");
  assert.equal(options[1]?.href, "/dashboard?tab=pending&view=manager");
});

await run("roleLabel returns the expected display label", () => {
  assert.equal(roleLabel("employee"), "Employee");
  assert.equal(roleLabel("manager"), "Manager");
  assert.equal(roleLabel("admin"), "Admin (HR)");
});

await run("getLifecycleGuard blocks deactivation when ownership still exists", () => {
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

await run("getReadinessState prioritizes blocked before attention", () => {
  assert.equal(getReadinessState({ blocked: true, attention: true }), "blocked");
  assert.equal(getReadinessState({ attention: true }), "attention");
  assert.equal(getReadinessState({}), "ready");
});

await run("getReadinessLabel returns the expected UI label", () => {
  assert.equal(getReadinessLabel("ready"), "Ready");
  assert.equal(getReadinessLabel("attention"), "Needs attention");
  assert.equal(getReadinessLabel("blocked"), "Blocked");
});

await run("toCsv escapes quotes and preserves header order", () => {
  const csv = toCsv([
    {
      title: 'Quarterly "Review"',
      total: 2,
      active: true
    }
  ]);

  assert.equal(
    csv,
    'title,total,active\n"Quarterly ""Review""","2","true"\n'
  );
});

await run("toCsv returns an empty string for no rows", () => {
  assert.equal(toCsv([]), "");
});

const failed = results.filter((result) => !result.ok);

console.log(
  `\nSmoke tests: ${results.length - failed.length} passed, ${failed.length} failed.`
);

if (failed.length > 0) {
  process.exit(1);
}
