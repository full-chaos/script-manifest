import type { Competition, CompetitionAccessType, CompetitionFilters, CompetitionVisibility } from "@script-manifest/contracts";

export interface CompetitionDirectoryRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  upsertCompetition(competition: Competition): Promise<{ existed: boolean }>;
  getCompetition(id: string): Promise<Competition | null>;
  listCompetitions(filters: CompetitionFilters): Promise<Competition[]>;
  getAllCompetitions(): Promise<Competition[]>;

  cancelCompetition(id: string): Promise<Competition | null>;
  updateVisibility(id: string, visibility: CompetitionVisibility): Promise<Competition | null>;
  updateAccessType(id: string, accessType: CompetitionAccessType): Promise<Competition | null>;
}
