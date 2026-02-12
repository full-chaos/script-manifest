import type { PrestigeTier, SubmissionStatus, TierDesignation } from "@script-manifest/contracts";

export const STATUS_WEIGHTS: Record<SubmissionStatus, number> = {
  pending: 0,
  quarterfinalist: 2,
  semifinalist: 4,
  finalist: 7,
  winner: 10
};

export const DEFAULT_PRESTIGE_MULTIPLIERS: Record<PrestigeTier, number> = {
  standard: 1.0,
  notable: 1.5,
  elite: 2.0,
  premier: 3.0
};

export const TIME_DECAY_HALF_LIFE_DAYS = 365;

export const CONFIDENCE_THRESHOLD = 5;

export const TIER_THRESHOLDS = {
  top_25: 0.25,
  top_10: 0.10,
  top_2: 0.02,
  top_1: 0.01
} as const;

export function computeTimeDecay(placementDateIso: string, nowIso: string): number {
  const daysSince =
    (new Date(nowIso).getTime() - new Date(placementDateIso).getTime()) / 86_400_000;
  if (daysSince <= 0) return 1.0;
  return Math.pow(0.5, daysSince / TIME_DECAY_HALF_LIFE_DAYS);
}

export function computeVerificationMultiplier(
  state: "pending" | "verified" | "rejected"
): number {
  switch (state) {
    case "verified":
      return 1.0;
    case "pending":
      return 0.5;
    case "rejected":
      return 0;
  }
}

export function computeConfidenceFactor(evaluationCount: number): number {
  return Math.min(1.0, 0.5 + (0.5 * evaluationCount) / CONFIDENCE_THRESHOLD);
}

export function computePlacementScore(params: {
  status: SubmissionStatus;
  prestigeMultiplier: number;
  verificationState: "pending" | "verified" | "rejected";
  placementDate: string;
  now: string;
  evaluationCount: number;
}): number {
  const statusWeight = STATUS_WEIGHTS[params.status];
  const verificationMult = computeVerificationMultiplier(params.verificationState);
  const timeDecay = computeTimeDecay(params.placementDate, params.now);
  const confidence = computeConfidenceFactor(params.evaluationCount);
  return statusWeight * params.prestigeMultiplier * verificationMult * timeDecay * confidence;
}

export function assignTier(
  rank: number,
  totalWriters: number
): TierDesignation | null {
  if (totalWriters === 0 || rank <= 0) return null;
  const percentile = rank / totalWriters;
  if (percentile <= TIER_THRESHOLDS.top_1) return "top_1";
  if (percentile <= TIER_THRESHOLDS.top_2) return "top_2";
  if (percentile <= TIER_THRESHOLDS.top_10) return "top_10";
  if (percentile <= TIER_THRESHOLDS.top_25) return "top_25";
  return null;
}

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "",
  quarterfinalist: "Quarterfinalist",
  semifinalist: "Semifinalist",
  finalist: "Finalist",
  winner: "Winner"
};

export function generateBadgeLabel(
  placementStatus: SubmissionStatus,
  competitionTitle: string,
  year: number
): string {
  const label = STATUS_LABELS[placementStatus];
  if (!label) return "";
  return `${label} - ${competitionTitle} ${year}`;
}

export function detectDuplicateSubmissions(
  submissions: Array<{ writerId: string; competitionId: string; projectId: string }>
): Array<{ writerId: string; competitionId: string; duplicateProjectIds: string[] }> {
  const byWriterComp = new Map<string, string[]>();
  for (const sub of submissions) {
    const key = `${sub.writerId}::${sub.competitionId}`;
    const existing = byWriterComp.get(key) ?? [];
    existing.push(sub.projectId);
    byWriterComp.set(key, existing);
  }
  const flags: Array<{
    writerId: string;
    competitionId: string;
    duplicateProjectIds: string[];
  }> = [];
  for (const [key, projectIds] of byWriterComp) {
    if (projectIds.length > 1) {
      const [writerId, competitionId] = key.split("::");
      flags.push({
        writerId: writerId!,
        competitionId: competitionId!,
        duplicateProjectIds: projectIds
      });
    }
  }
  return flags;
}
