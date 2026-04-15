export const APP_ROLES = ["employee", "manager", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function roleLabel(role: AppRole) {
  switch (role) {
    case "employee":
      return "Employee";
    case "manager":
      return "Manager";
    case "admin":
      return "Admin (HR)";
  }
}
