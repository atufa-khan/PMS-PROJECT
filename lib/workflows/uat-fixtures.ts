import { APP_ROLES, type AppRole } from "@/lib/auth/roles";

export type SeededUatFixtureDefinition = {
  key: string;
  title: string;
  email: string;
  primaryRole: AppRole;
  roles: AppRole[];
  temporaryPassword: string;
  description: string;
  notes: string[];
};

export const SEEDED_UAT_FIXTURES: SeededUatFixtureDefinition[] = [
  {
    key: "admin",
    title: "Admin HR fixture",
    email: "aarav.shah@pms.local",
    primaryRole: "admin",
    roles: ["admin"],
    temporaryPassword: "PmsAdmin!2026",
    description:
      "Use this account for org-level oversight, flags, provisioning, reports, readiness, and UAT sign-off.",
    notes: [
      "Expected workspace: Admin (HR)",
      "Covers compliance, user provisioning, and escalations"
    ]
  },
  {
    key: "manager",
    title: "Manager / player-coach fixture",
    email: "neha.rao@pms.local",
    primaryRole: "manager",
    roles: ["manager", "employee"],
    temporaryPassword: "PmsManager!2026",
    description:
      "Use this account for team approvals, review actions, probation participation, and workspace-switch testing.",
    notes: [
      "Expected workspaces: Manager + Employee",
      "Covers player-coach toggle behavior"
    ]
  },
  {
    key: "employee",
    title: "Primary employee fixture",
    email: "ishita.gupta@pms.local",
    primaryRole: "employee",
    roles: ["employee"],
    temporaryPassword: "PmsEmployee!2026",
    description:
      "Use this account for goal draft/edit/submit, self review, and probation feedback participation.",
    notes: [
      "Expected workspace: Employee",
      "Has seeded pending-goal and active-goal scenarios"
    ]
  },
  {
    key: "employee-blocked",
    title: "Blocked-routing employee fixture",
    email: "rohan.mehta@pms.local",
    primaryRole: "employee",
    roles: ["employee"],
    temporaryPassword: "PmsEmployee2!2026",
    description:
      "Use this account to validate missing-manager routing, blocked probation, and admin remediation behavior.",
    notes: [
      "Expected workspace: Employee",
      "Deliberately seeded with missing manager assignment"
    ]
  }
];

export function isValidFixtureRole(role: string): role is AppRole {
  return APP_ROLES.includes(role as AppRole);
}
