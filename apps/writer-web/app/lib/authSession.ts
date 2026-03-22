import type { AuthUser } from "@script-manifest/contracts";

export function formatUserLabel(user: AuthUser): string {
  return `${user.displayName} (${user.email})`;
}
