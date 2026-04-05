export { getTypesenseClient, _resetTypesenseClient } from "./client.js";
export {
  COMPETITIONS_COLLECTION,
  competitionsSchema,
  type CompetitionDocument,
  ensureCompetitionsCollection,
  searchCompetitions,
  upsertCompetitionDocument,
  deleteCompetitionDocument
} from "./collections/competitions.js";
export {
  TALENT_COLLECTION,
  talentSchema,
  type TalentDocument,
  ensureTalentCollection,
  searchTalent,
  upsertTalentDocument,
  deleteTalentDocument,
} from "./collections/talent.js";
export {
  PROJECTS_COLLECTION,
  projectsSchema,
  type ProjectDocument,
  ensureProjectsCollection,
  searchProjects,
  upsertProjectDocument,
  deleteProjectDocument,
} from "./collections/projects.js";
export { competitionToDocument, talentToDocument, projectToDocument } from "./sync.js";
