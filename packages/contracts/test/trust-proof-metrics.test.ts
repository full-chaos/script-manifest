import assert from "node:assert/strict";
import test from "node:test";
import {
  TrustProofMetricsAdminResponseSchema,
  TrustProofMetricsPublicResponseSchema,
  TrustProofMetricsSchema
} from "../src/trust-proof-metrics.js";

const metricPayload = {
  snapshotAt: "2026-05-24T12:00:00.000Z",
  scriptsHostedTotal: 12,
  placementsRecordedTotal: 8,
  placementsVerifiedTotal: 5,
  competitionsTrackedTotal: 7,
  exportsGeneratedTotal: 3,
  verifiedIndustryDownloadsTotal: 4,
  writersExportablePct: 100,
  sourceDataStamps: {
    scriptsMaxUpdatedAt: "2026-05-24T11:00:00.000Z",
    placementsMaxUpdatedAt: "2026-05-24T11:05:00.000Z",
    competitionsMaxSavedAt: "2026-05-24T11:10:00.000Z",
    exportsMaxGeneratedAt: "2026-05-24T11:15:00.000Z",
    downloadsMaxDownloadedAt: "2026-05-24T11:20:00.000Z",
    writersMaxUpdatedAt: null
  }
};

test("TrustProofMetricsSchema parses source stamps and aggregate counters", () => {
  const parsed = TrustProofMetricsSchema.parse(metricPayload);

  assert.equal(parsed.scriptsHostedTotal, 12);
  assert.equal(parsed.sourceDataStamps.writersMaxUpdatedAt, null);
});

test("TrustProofMetricsPublicResponseSchema hides admin source stamps", () => {
  const parsed = TrustProofMetricsPublicResponseSchema.parse({ metrics: metricPayload });

  assert.equal("sourceDataStamps" in parsed.metrics, false);
  assert.equal(parsed.metrics.exportsGeneratedTotal, 3);
});

test("TrustProofMetricsAdminResponseSchema includes refresh metadata and warnings", () => {
  const parsed = TrustProofMetricsAdminResponseSchema.parse({
    metrics: metricPayload,
    refresh: {
      refreshedAt: "2026-05-24T12:01:00.000Z",
      cacheTtlSeconds: 60,
      warnings: [{ metric: "exportsGeneratedTotal", reason: "No export events yet" }]
    }
  });

  assert.equal(parsed.refresh.warnings[0]?.metric, "exportsGeneratedTotal");
});

test("TrustProofMetricsSchema rejects negative counts and invalid percentages", () => {
  const result = TrustProofMetricsSchema.safeParse({
    ...metricPayload,
    scriptsHostedTotal: -1,
    writersExportablePct: 101
  });

  assert.equal(result.success, false);
});
