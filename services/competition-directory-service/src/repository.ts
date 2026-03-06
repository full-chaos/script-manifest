import type { Competition, CompetitionFilters } from "@script-manifest/contracts";

export interface CompetitionDirectoryRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  upsertCompetition(competition: Competition): Promise<{ existed: boolean }>;
  getCompetition(id: string): Promise<Competition | null>;
  listCompetitions(filters: CompetitionFilters): Promise<Competition[]>;
  getAllCompetitions(): Promise<Competition[]>;
}
