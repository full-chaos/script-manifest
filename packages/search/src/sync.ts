import type { Competition, Project } from "@script-manifest/contracts";
import type { CompetitionDocument } from "./collections/competitions.js";
import type { TalentDocument } from "./collections/talent.js";
import type { ProjectDocument } from "./collections/projects.js";

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

export function talentToDocument(fields: {
  writerId: string;
  projectId: string;
  displayName: string;
  representationStatus: string;
  genres: string[];
  demographics: string[];
  projectTitle: string;
  projectFormat: string;
  projectGenre: string;
  logline: string;
  synopsis: string;
  isSearchable: boolean;
  updatedAt?: string;
}): TalentDocument {
  return {
    id: `${fields.writerId}_${fields.projectId}`,
    writerId: fields.writerId,
    displayName: fields.displayName,
    representationStatus: fields.representationStatus,
    genres: fields.genres,
    demographics: fields.demographics,
    projectId: fields.projectId,
    projectTitle: fields.projectTitle,
    projectFormat: fields.projectFormat,
    projectGenre: fields.projectGenre,
    logline: fields.logline,
    synopsis: fields.synopsis,
    isSearchable: fields.isSearchable,
    updatedAt: fields.updatedAt
      ? Math.floor(new Date(fields.updatedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
  };
}

export function projectToDocument(
  project: Project,
): ProjectDocument {
  return {
    id: project.id,
    ownerUserId: project.ownerUserId,
    title: project.title,
    logline: project.logline,
    synopsis: project.synopsis,
    format: project.format,
    genre: project.genre,
    pageCount: project.pageCount,
    isDiscoverable: project.isDiscoverable,
    updatedAt: project.updatedAt
      ? Math.floor(new Date(project.updatedAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
  };
}
