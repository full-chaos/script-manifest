import type { Competition } from "@script-manifest/contracts";
import type { CompetitionDocument } from "./collections/competitions.js";

export function competitionToDocument(
  competition: Competition,
  timestamps?: { createdAt?: string; updatedAt?: string }
): CompetitionDocument {
  return {
    id: competition.id,
    title: competition.title,
    description: competition.description,
    format: competition.format,
    genre: competition.genre,
    feeUsd: competition.feeUsd,
    deadline: Math.floor(new Date(competition.deadline).getTime() / 1000),
    status: competition.status,
    visibility: competition.visibility,
    accessType: competition.accessType,
    createdAt: timestamps?.createdAt
      ? Math.floor(new Date(timestamps.createdAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
    updatedAt: timestamps?.updatedAt
      ? Math.floor(new Date(timestamps.updatedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000)
  };
}
