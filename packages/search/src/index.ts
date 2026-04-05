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
export { competitionToDocument } from "./sync.js";
