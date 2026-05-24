import type { Competition, CompetitionAccessType, CompetitionFilters, CompetitionVisibility, SaveCompetitionRequest, SavedCompetition } from "@script-manifest/contracts";

export type DueCompetitionReminderDispatch = {
  id: string;
  writerId: string;
  competitionId: string;
  fireAt: Date;
  competitionTitle: string;
  competitionDeadline: string;
};

export interface CompetitionReminderDispatchRepository {
  listDueReminderDispatches(limit?: number): Promise<DueCompetitionReminderDispatch[]>;
  markReminderDispatched(id: string, notificationEventId: string): Promise<void>;
}

export interface CompetitionDirectoryRepository extends CompetitionReminderDispatchRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  upsertCompetition(competition: Competition): Promise<{ existed: boolean }>;
  getCompetition(id: string): Promise<Competition | null>;
  listCompetitions(filters: CompetitionFilters): Promise<Competition[]>;
  getAllCompetitions(): Promise<Competition[]>;
  saveCompetition(input: SaveCompetitionRequest & { competitionId: string }): Promise<SavedCompetition>;
  unsaveCompetition(writerId: string, competitionId: string): Promise<boolean>;
  listSavedCompetitions(writerId: string): Promise<SavedCompetition[]>;

  cancelCompetition(id: string): Promise<Competition | null>;
  updateVisibility(id: string, visibility: CompetitionVisibility): Promise<Competition | null>;
  updateAccessType(id: string, accessType: CompetitionAccessType): Promise<Competition | null>;
}
