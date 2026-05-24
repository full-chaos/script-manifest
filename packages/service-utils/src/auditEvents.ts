export const PRIVILEGED_AUDIT_ACTIONS = [
  "provider.review",
  "coverage.dispute.resolve",
  "feedback.dispute.resolve",
  "ranking.prestige.update",
  "ranking.recompute",
  "ranking.flag.resolve",
  "ranking.appeal.resolve",
  "competition.moderate",
  "notification.admin.send",
  "feature_flag.create",
  "feature_flag.update",
  "feature_flag.delete",
  "user.suspend",
  "security.ip_block.update"
] as const;

export type PrivilegedAuditAction = (typeof PRIVILEGED_AUDIT_ACTIONS)[number];
