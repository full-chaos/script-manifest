import assert from "node:assert/strict";
import test from "node:test";
import { TrustProofMetricsAdminResponseSchema, TrustProofMetricsPublicResponseSchema } from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import { createScheduler } from "./scheduler.js";
import { REFRESH_TRUST_PROOF_METRICS_SQL, type TrustProofMetricsRepository } from "./repository.js";

test("refresh SQL aggregates only public scripts and verified industry downloads", () => {
  assert.match(REFRESH_TRUST_PROOF_METRICS_SQL, /FROM scripts\s+WHERE visibility = 'public'/);
  assert.match(REFRESH_TRUST_PROOF_METRICS_SQL, /COUNT\(\*\) FILTER \(WHERE verification_state = 'verified'\)::int AS verified/);
  assert.match(REFRESH_TRUST_PROOF_METRICS_SQL, /FROM writer_export_events/);
  assert.match(REFRESH_TRUST_PROOF_METRICS_SQL, /WHERE ia\.verification_status = 'verified'/);
});

test("repository fixture refresh inserts a snapshot with correct aggregate counts and source stamps", async () => {
  const repository = new MemoryMetricsRepository({
    scripts: [
      { visibility: "public", updatedAt: "2026-05-24T10:00:00.000Z" },
      { visibility: "private", updatedAt: "2026-05-24T10:01:00.000Z" },
      { visibility: "approved_only", updatedAt: "2026-05-24T10:02:00.000Z" },
      { visibility: "evidence", updatedAt: "2026-05-24T10:03:00.000Z" }
    ],
    placements: [
      { verificationState: "verified", updatedAt: "2026-05-24T10:10:00.000Z" },
      { verificationState: "pending", updatedAt: "2026-05-24T10:11:00.000Z" },
      { verificationState: "rejected", updatedAt: "2026-05-24T10:12:00.000Z" }
    ],
    savedCompetitions: [{ savedAt: "2026-05-24T10:20:00.000Z" }, { savedAt: "2026-05-24T10:21:00.000Z" }],
    exportEvents: [
      { status: "generated", generatedAt: "2026-05-24T10:30:00.000Z" },
      { status: "failed", generatedAt: "2026-05-24T10:31:00.000Z" }
    ],
    downloads: [
      { industryVerificationStatus: "verified", downloadedAt: "2026-05-24T10:40:00.000Z" },
      { industryVerificationStatus: "rejected", downloadedAt: "2026-05-24T10:41:00.000Z" }
    ],
    writers: [
      { role: "writer", updatedAt: "2026-05-24T10:50:00.000Z" },
      { role: "admin", updatedAt: "2026-05-24T10:51:00.000Z" }
    ]
  });

  const snapshot = await repository.refreshSnapshot();

  assert.equal(snapshot.scriptsHostedTotal, 1);
  assert.equal(snapshot.placementsRecordedTotal, 3);
  assert.equal(snapshot.placementsVerifiedTotal, 1);
  assert.equal(snapshot.competitionsTrackedTotal, 2);
  assert.equal(snapshot.exportsGeneratedTotal, 1);
  assert.equal(snapshot.verifiedIndustryDownloadsTotal, 1);
  assert.equal(snapshot.writersExportablePct, 100);
  assert.equal(snapshot.sourceDataStamps.scriptsMaxUpdatedAt, "2026-05-24T10:00:00.000Z");
  assert.equal(snapshot.sourceDataStamps.exportsMaxGeneratedAt, "2026-05-24T10:30:00.000Z");
  assert.equal(repository.snapshots.length, 1);
});

test("repository fixture refresh handles zero rows with zero counts and null stamps", async () => {
  const repository = new MemoryMetricsRepository();
  const snapshot = await repository.refreshSnapshot();

  assert.equal(snapshot.scriptsHostedTotal, 0);
  assert.equal(snapshot.placementsRecordedTotal, 0);
  assert.equal(snapshot.writersExportablePct, 0);
  assert.equal(snapshot.sourceDataStamps.scriptsMaxUpdatedAt, null);
});

test("repository fixture excludes soft-deleted/deleted source rows from counts", async () => {
  const repository = new MemoryMetricsRepository({
    scripts: [
      { visibility: "public", updatedAt: "2026-05-24T10:00:00.000Z" },
      { visibility: "public", updatedAt: "2026-05-24T10:01:00.000Z", deletedAt: "2026-05-24T10:02:00.000Z" }
    ],
    placements: [
      { verificationState: "verified", updatedAt: "2026-05-24T10:10:00.000Z", deletedAt: "2026-05-24T10:11:00.000Z" },
      { verificationState: "verified", updatedAt: "2026-05-24T10:12:00.000Z" }
    ]
  });

  const snapshot = await repository.refreshSnapshot();

  assert.equal(snapshot.scriptsHostedTotal, 1);
  assert.equal(snapshot.placementsRecordedTotal, 1);
  assert.equal(snapshot.placementsVerifiedTotal, 1);
});

test("public endpoint returns latest snapshot and public cache policy without source stamps", async (t) => {
  const repository = new MemoryMetricsRepository();
  await repository.refreshSnapshot();
  const server = buildServer({ logger: false, repository });
  t.after(async () => { await server.close(); });

  const response = await server.inject({ method: "GET", url: "/internal/trust-proof-metrics/public" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "public, max-age=300, stale-while-revalidate=900");
  const parsed = TrustProofMetricsPublicResponseSchema.parse(response.json());
  assert.equal("sourceDataStamps" in parsed.metrics, false);
});

test("admin endpoints require admin role and manual refresh returns admin payload", async (t) => {
  const repository = new MemoryMetricsRepository();
  const server = buildServer({ logger: false, repository });
  t.after(async () => { await server.close(); });

  const blocked = await server.inject({ method: "GET", url: "/internal/admin/trust-proof-metrics" });
  assert.equal(blocked.statusCode, 403);

  const refreshed = await server.inject({
    method: "POST",
    url: "/internal/admin/trust-proof-metrics/refresh",
    headers: { "x-auth-user-role": "admin" }
  });

  assert.equal(refreshed.statusCode, 200);
  assert.equal(refreshed.headers["cache-control"], "private, max-age=60, stale-while-revalidate=240");
  TrustProofMetricsAdminResponseSchema.parse(refreshed.json());
  assert.equal(repository.snapshots.length, 1);
});

test("scheduler refreshes immediately on startup when no snapshot exists and then uses interval", async () => {
  const repository = new MemoryMetricsRepository();
  let intervalMs = 0;
  const scheduler = createScheduler(repository, {
    setInterval: (_callback, ms) => {
      intervalMs = ms;
      return 1;
    },
    clearInterval: () => undefined
  });

  await scheduler.start();
  scheduler.stop();

  assert.equal(repository.snapshots.length, 1);
  assert.equal(intervalMs, 15 * 60 * 1000);
});

type Fixture = {
  scripts?: Array<{ visibility: string; updatedAt: string; deletedAt?: string }>;
  placements?: Array<{ verificationState: string; updatedAt: string; deletedAt?: string }>;
  savedCompetitions?: Array<{ savedAt: string; deletedAt?: string }>;
  exportEvents?: Array<{ status: string; generatedAt: string }>;
  downloads?: Array<{ industryVerificationStatus: string; downloadedAt: string }>;
  writers?: Array<{ role: string; updatedAt: string; deletedAt?: string }>;
};

class MemoryMetricsRepository implements TrustProofMetricsRepository {
  snapshots: Awaited<ReturnType<TrustProofMetricsRepository["refreshSnapshot"]>>[] = [];

  constructor(private readonly fixture: Fixture = {}) {}

  async getLatestSnapshot() {
    return this.snapshots.at(-1) ?? null;
  }

  async refreshSnapshot() {
    const activeScripts = (this.fixture.scripts ?? []).filter((script) => !script.deletedAt && script.visibility === "public");
    const activePlacements = (this.fixture.placements ?? []).filter((placement) => !placement.deletedAt);
    const generatedExports = (this.fixture.exportEvents ?? []).filter((event) => event.status === "generated");
    const verifiedDownloads = (this.fixture.downloads ?? []).filter((download) => download.industryVerificationStatus === "verified");
    const writerRows = (this.fixture.writers ?? []).filter((writer) => !writer.deletedAt && writer.role === "writer");
    const snapshot = {
      snapshotAt: new Date().toISOString(),
      scriptsHostedTotal: activeScripts.length,
      placementsRecordedTotal: activePlacements.length,
      placementsVerifiedTotal: activePlacements.filter((placement) => placement.verificationState === "verified").length,
      competitionsTrackedTotal: (this.fixture.savedCompetitions ?? []).filter((competition) => !competition.deletedAt).length,
      exportsGeneratedTotal: generatedExports.length,
      verifiedIndustryDownloadsTotal: verifiedDownloads.length,
      writersExportablePct: writerRows.length === 0 ? 0 : 100,
      sourceDataStamps: {
        scriptsMaxUpdatedAt: maxStamp(activeScripts.map((script) => script.updatedAt)),
        placementsMaxUpdatedAt: maxStamp(activePlacements.map((placement) => placement.updatedAt)),
        competitionsMaxSavedAt: maxStamp((this.fixture.savedCompetitions ?? []).filter((competition) => !competition.deletedAt).map((competition) => competition.savedAt)),
        exportsMaxGeneratedAt: maxStamp(generatedExports.map((event) => event.generatedAt)),
        downloadsMaxDownloadedAt: maxStamp(verifiedDownloads.map((download) => download.downloadedAt)),
        writersMaxUpdatedAt: maxStamp(writerRows.map((writer) => writer.updatedAt))
      }
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  async pruneSnapshots() {}
}

function maxStamp(stamps: string[]): string | null {
  return stamps.sort().at(-1) ?? null;
}
