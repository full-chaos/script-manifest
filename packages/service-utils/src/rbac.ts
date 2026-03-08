export const ROLES = ["writer", "admin", "partner", "industry_professional"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  "profile:read": ["writer", "admin", "partner", "industry_professional"],
  "profile:write": ["writer", "admin"],
  "project:read": ["writer", "admin", "partner", "industry_professional"],
  "project:write": ["writer", "admin"],
  "feedback:read": ["writer", "admin"],
  "feedback:write": ["writer", "admin"],
  "submission:read": ["writer", "admin", "partner"],
  "submission:write": ["writer", "admin"],
  "admin:competitions": ["admin"],
  "admin:coverage": ["admin"],
  "admin:industry": ["admin"],
  "admin:programs": ["admin"],
  "admin:users": ["admin"],
  "admin:notifications": ["admin"],
  "admin:search": ["admin"],
  "admin:feature-flags": ["admin"],
  "admin:security": ["admin"],
  "partner:competitions:manage": ["partner", "admin"],
  "partner:evaluations": ["partner", "admin"],
  "industry:talent:search": ["industry_professional", "admin"],
  "industry:download": ["industry_professional", "admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function hasRole(role: Role, requiredRole: Role): boolean {
  if (requiredRole === "writer") {
    return true;
  }

  return role === requiredRole || role === "admin";
}
