import assert from "node:assert/strict";
import test from "node:test";
import type { Competition } from "@script-manifest/contracts";
import type { CompetitionDirectoryRepository } from "./repository.js";

function createCompetition(overrides: Partial<Competition> & Pick<Competition, "id" | "title" | "format" | "genre" | "deadline">): Competition {
  return {
    description: "",
    feeUsd: 0,
    status: "active",
    visibility: "listed",
    accessType: "open",
    ...overrides
  };
}

class MemoryCompetitionDirectoryRepository implements CompetitionDirectoryRepository {
  private readonly competitions = new Map<string, Competition>();

  constructor(seed: Competition[] = []) {
    for (const competition of seed) {
      this.competitions.set(competition.id, competition);
    }
  }

  async init(): Promise<void> {
    return;
  }

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async upsertCompetition(competition: Competition): Promise<{ existed: boolean }> {
    const existed = this.competitions.has(competition.id);
    this.competitions.set(competition.id, competition);
    return { existed };
  }

  async getCompetition(id: string): Promise<Competition | null> {
    return this.competitions.get(id) ?? null;
  }

  async listCompetitions(filters: Parameters<CompetitionDirectoryRepository["listCompetitions"]>[0]): Promise<Competition[]> {
    const loweredQuery = filters.query?.toLowerCase();

    return Array.from(this.competitions.values()).filter((competition) => {
      if (!filters.includeCancelled && competition.status === "cancelled") {
        return false;
      }

      if (!filters.includeHidden && competition.visibility === "unlisted") {
        return false;
      }

      if (loweredQuery && !`${competition.title} ${competition.description}`.toLowerCase().includes(loweredQuery)) {
        return false;
      }

      if (filters.format && competition.format.toLowerCase() !== filters.format.toLowerCase()) {
        return false;
      }

      if (filters.genre && competition.genre.toLowerCase() !== filters.genre.toLowerCase()) {
        return false;
      }

      if (typeof filters.maxFeeUsd === "number" && competition.feeUsd > filters.maxFeeUsd) {
        return false;
      }

      if (filters.deadlineBefore && new Date(competition.deadline) >= filters.deadlineBefore) {
        return false;
      }

      return true;
    });
  }

  async getAllCompetitions(): Promise<Competition[]> {
    return Array.from(this.competitions.values());
  }

  async cancelCompetition(id: string): Promise<Competition | null> {
    const competition = this.competitions.get(id);
    if (!competition || competition.status === "cancelled") {
      return null;
    }

    const updated = { ...competition, status: "cancelled" as const };
    this.competitions.set(id, updated);
    return updated;
  }

  async updateVisibility(id: string, visibility: Competition["visibility"]): Promise<Competition | null> {
    const competition = this.competitions.get(id);
    if (!competition) {
      return null;
    }

    const updated = { ...competition, visibility };
    this.competitions.set(id, updated);
    return updated;
  }

  async updateAccessType(id: string, accessType: Competition["accessType"]): Promise<Competition | null> {
    const competition = this.competitions.get(id);
    if (!competition) {
      return null;
    }

    const updated = { ...competition, accessType };
    this.competitions.set(id, updated);
    return updated;
  }
}

test("CompetitionDirectoryRepository contract stores and retrieves competitions", async () => {
  const repo = new MemoryCompetitionDirectoryRepository([
    createCompetition({
      id: "comp_1",
      title: "Screenplay Sprint",
      description: "Seed competition record for local development",
      format: "feature",
      genre: "drama",
      feeUsd: 25,
      deadline: "2026-05-01T23:59:59Z"
    })
  ]);

  assert.deepEqual(await repo.healthCheck(), { database: true });
  await repo.init();

  const created = await repo.upsertCompetition(
    createCompetition({
      id: "comp_2",
      title: "TV Pilot Challenge",
      description: "Serialized drama",
      format: "tv",
      genre: "drama",
      feeUsd: 50,
      deadline: "2026-07-01T23:59:59Z",
      visibility: "unlisted"
    })
  );

  assert.equal(created.existed, false);
  assert.equal((await repo.getCompetition("comp_2"))?.title, "TV Pilot Challenge");

  const updated = await repo.upsertCompetition(
    createCompetition({
      id: "comp_2",
      title: "TV Pilot Challenge Updated",
      description: "Serialized drama",
      format: "tv",
      genre: "drama",
      feeUsd: 45,
      deadline: "2026-07-15T23:59:59Z",
      visibility: "unlisted"
    })
  );

  assert.equal(updated.existed, true);
  assert.equal((await repo.getCompetition("comp_2"))?.title, "TV Pilot Challenge Updated");
  assert.equal((await repo.getCompetition("missing")), null);
  assert.deepEqual((await repo.getAllCompetitions()).map((competition) => competition.id), ["comp_1", "comp_2"]);
});

test("CompetitionDirectoryRepository contract filters hidden and cancelled competitions", async () => {
  const repo = new MemoryCompetitionDirectoryRepository([
    createCompetition({
      id: "comp_1",
      title: "Screenplay Sprint",
      description: "Seed competition record for local development",
      format: "feature",
      genre: "drama",
      feeUsd: 25,
      deadline: "2026-05-01T23:59:59Z"
    }),
    createCompetition({
      id: "comp_2",
      title: "Festival Lab",
      description: "Invite only festival",
      format: "feature",
      genre: "thriller",
      feeUsd: 75,
      deadline: "2026-09-01T23:59:59Z",
      status: "cancelled",
      visibility: "unlisted"
    }),
    createCompetition({
      id: "comp_3",
      title: "TV Pilot Challenge",
      description: "Serialized drama",
      format: "tv",
      genre: "drama",
      feeUsd: 50,
      deadline: "2026-07-01T23:59:59Z",
      visibility: "unlisted"
    })
  ]);

  assert.deepEqual((await repo.listCompetitions({})).map((competition) => competition.id), ["comp_1"]);
  assert.deepEqual(
    (await repo.listCompetitions({
      query: "serialized",
      format: "tv",
      genre: "drama",
      maxFeeUsd: 60,
      deadlineBefore: new Date("2026-08-01T00:00:00.000Z"),
      includeHidden: true
    })).map((competition) => competition.id),
    ["comp_3"]
  );
  assert.deepEqual(
    (await repo.listCompetitions({ includeHidden: true, includeCancelled: true })).map((competition) => competition.id),
    ["comp_1", "comp_2", "comp_3"]
  );
});

test("CompetitionDirectoryRepository contract cancels and updates competition settings", async () => {
  const repo = new MemoryCompetitionDirectoryRepository([
    createCompetition({
      id: "comp_1",
      title: "Screenplay Sprint",
      description: "Seed competition record for local development",
      format: "feature",
      genre: "drama",
      feeUsd: 25,
      deadline: "2026-05-01T23:59:59Z"
    })
  ]);

  const cancelled = await repo.cancelCompetition("comp_1");
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(await repo.cancelCompetition("comp_1"), null);
  assert.equal(await repo.cancelCompetition("missing"), null);

  const visibility = await repo.updateVisibility("comp_1", "unlisted");
  assert.equal(visibility?.visibility, "unlisted");

  const accessType = await repo.updateAccessType("comp_1", "invite_only");
  assert.equal(accessType?.accessType, "invite_only");

  assert.equal(await repo.updateVisibility("missing", "listed"), null);
  assert.equal(await repo.updateAccessType("missing", "open"), null);
});
