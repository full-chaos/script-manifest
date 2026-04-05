import type { IndustryTalentSearchFilters } from "@script-manifest/contracts";
import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";
import type { SearchParams } from "typesense/lib/Typesense/Documents.js";
import { getTypesenseClient } from "../client.js";

export const TALENT_COLLECTION = "talent";

export const talentSchema: CollectionCreateSchema = {
  name: TALENT_COLLECTION,
  fields: [
    { name: "id", type: "string" },
    { name: "writerId", type: "string" },
    { name: "displayName", type: "string" },
    { name: "representationStatus", type: "string", facet: true },
    { name: "genres", type: "string[]", facet: true },
    { name: "demographics", type: "string[]", facet: true },
    { name: "projectId", type: "string" },
    { name: "projectTitle", type: "string" },
    { name: "projectFormat", type: "string", facet: true },
    { name: "projectGenre", type: "string", facet: true },
    { name: "logline", type: "string", optional: true },
    { name: "synopsis", type: "string", optional: true },
    { name: "isSearchable", type: "bool" },
    { name: "updatedAt", type: "int64" },
  ],
  default_sorting_field: "updatedAt",
};

export type TalentDocument = {
  id: string;
  writerId: string;
  displayName: string;
  representationStatus: string;
  genres: string[];
  demographics: string[];
  projectId: string;
  projectTitle: string;
  projectFormat: string;
  projectGenre: string;
  logline: string;
  synopsis: string;
  isSearchable: boolean;
  updatedAt: number;
};

export async function ensureTalentCollection(): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  try {
    await client.collections(TALENT_COLLECTION).retrieve();
  } catch {
    await client.collections().create(talentSchema);
  }
}

export async function searchTalent(
  filters: IndustryTalentSearchFilters,
): Promise<{
  hits: TalentDocument[];
  found: number;
  searchTimeMs: number;
  facets: Record<string, Array<{ value: string; count: number }>>;
} | null> {
  const client = getTypesenseClient();
  if (!client) return null;

  const filterParts: string[] = ["isSearchable:=true"];

  if (filters.genre) {
    filterParts.push(`projectGenre:=${filters.genre}`);
  }
  if (filters.format) {
    filterParts.push(`projectFormat:=${filters.format}`);
  }
  if (filters.representationStatus) {
    filterParts.push(`representationStatus:=${filters.representationStatus}`);
  }
  if (filters.demographics && filters.demographics.length > 0) {
    filterParts.push(`demographics:=[${filters.demographics.join(",")}]`);
  }
  if (filters.genres && filters.genres.length > 0) {
    filterParts.push(`genres:=[${filters.genres.join(",")}]`);
  }

  const hasQuery = filters.q && filters.q.trim().length > 0;
  const sortBy =
    hasQuery && (filters.sort ?? "recent") === "relevance"
      ? "_text_match:desc,updatedAt:desc"
      : "updatedAt:desc";

  const searchParams: SearchParams<TalentDocument> = {
    q: hasQuery ? filters.q! : "*",
    query_by: "displayName,projectTitle,logline,synopsis",
    query_by_weights: "3,2,1,1",
    prefix: "true,true,true,true",
    filter_by: filterParts.join(" && "),
    sort_by: sortBy,
    facet_by: "genres,demographics,representationStatus,projectFormat,projectGenre",
    per_page: filters.limit ?? 20,
    page: Math.floor((filters.offset ?? 0) / (filters.limit ?? 20)) + 1,
  };

  const result = await client
    .collections<TalentDocument>(TALENT_COLLECTION)
    .documents()
    .search(searchParams);

  const hits = (result.hits ?? [])
    .map((hit) => hit.document)
    .filter((doc): doc is TalentDocument => doc != null);

  const facets: Record<string, Array<{ value: string; count: number }>> = {};
  for (const facet of result.facet_counts ?? []) {
    facets[String(facet.field_name)] = facet.counts.map((c) => ({
      value: c.value,
      count: c.count,
    }));
  }

  return { hits, found: result.found, searchTimeMs: result.search_time_ms, facets };
}

export async function upsertTalentDocument(doc: TalentDocument): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  await client.collections<TalentDocument>(TALENT_COLLECTION).documents().upsert(doc);
}

export async function deleteTalentDocument(id: string): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  try {
    await client.collections(TALENT_COLLECTION).documents(id).delete();
  } catch {
    return;
  }
}
