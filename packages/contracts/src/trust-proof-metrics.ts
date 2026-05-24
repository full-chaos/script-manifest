import { z } from "zod";

export const TrustProofMetricsSchema = z.object({
  snapshotAt: z.string().datetime({ offset: true }),
  scriptsHostedTotal: z.number().int().nonnegative(),
  placementsRecordedTotal: z.number().int().nonnegative(),
  placementsVerifiedTotal: z.number().int().nonnegative(),
  competitionsTrackedTotal: z.number().int().nonnegative(),
  exportsGeneratedTotal: z.number().int().nonnegative(),
  verifiedIndustryDownloadsTotal: z.number().int().nonnegative(),
  writersExportablePct: z.number().min(0).max(100),
  sourceDataStamps: z.object({
    scriptsMaxUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    placementsMaxUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    competitionsMaxSavedAt: z.string().datetime({ offset: true }).nullable(),
    exportsMaxGeneratedAt: z.string().datetime({ offset: true }).nullable(),
    downloadsMaxDownloadedAt: z.string().datetime({ offset: true }).nullable(),
    writersMaxUpdatedAt: z.string().datetime({ offset: true }).nullable()
  })
});
export type TrustProofMetrics = z.infer<typeof TrustProofMetricsSchema>;

export const TrustProofMetricsPublicResponseSchema = z.object({
  metrics: TrustProofMetricsSchema.pick({
    snapshotAt: true,
    scriptsHostedTotal: true,
    placementsRecordedTotal: true,
    placementsVerifiedTotal: true,
    competitionsTrackedTotal: true,
    exportsGeneratedTotal: true,
    verifiedIndustryDownloadsTotal: true,
    writersExportablePct: true
  })
});
export type TrustProofMetricsPublicResponse = z.infer<typeof TrustProofMetricsPublicResponseSchema>;

export const TrustProofMetricsAdminResponseSchema = z.object({
  metrics: TrustProofMetricsSchema,
  refresh: z.object({
    refreshedAt: z.string().datetime({ offset: true }),
    cacheTtlSeconds: z.number().int(),
    warnings: z.array(
      z.object({
        metric: z.string(),
        reason: z.string()
      })
    )
  })
});
export type TrustProofMetricsAdminResponse = z.infer<typeof TrustProofMetricsAdminResponseSchema>;
