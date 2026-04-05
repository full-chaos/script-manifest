import type { CompetitionFilters } from "@script-manifest/contracts";
import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";
import type { SearchParams } from "typesense/lib/Typesense/Documents.js";
import { getTypesenseClient } from "../client.js";

export const COMPETITIONS_COLLECTION = "competitions";

export const competitionsSchema: CollectionCreateSchema = {
  name: COMPETITIONS_COLLECTION,
  fields: [
    { name: "id", type: "string" },
    { name: "title", type: "string" },
    { name: "description", type: "string" },
    { name: "format", type: "string", facet: true },
    { name: "genre", type: "string", facet: true },
    { name: "feeUsd", type: "float", facet: true },
    { name: "deadline", type: "int64" },
    { name: "status", type: "string", facet: true },
    { name: "visibility", type: "string" },
    { name: "accessType", type: "string", facet: true },
    { name: "createdAt", type: "int64" },
    { name: "updatedAt", type: "int64" }
  ],
  default_sorting_field: "createdAt"
};

export type CompetitionDocument = {
  id: string;
  title: string;
  description: string;
  format: string;
  genre: string;
  feeUsd: number;
  deadline: number;
  status: string;
  visibility: string;
  accessType: string;
  createdAt: number;
  updatedAt: number;
};

export async function ensureCompetitionsCollection(): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  try {
    await client.collections(COMPETITIONS_COLLECTION).retrieve();
  } catch {
    await client.collections().create(competitionsSchema);
  }
}

export async function searchCompetitions(
  filters: CompetitionFilters
): Promise<{
  hits: CompetitionDocument[];
  found: number;
  searchTimeMs: number;
  facets: Record<string, Array<{ value: string; count: number }>>;
} | null> {
  const client = getTypesenseClient();
  if (!client) return null;

  const filterParts: string[] = [];

  if (!filters.includeCancelled) {
    filterParts.push("status:=active");
  }

  if (!filters.includeHidden) {
    filterParts.push("visibility:=listed");
  }

  if (filters.format) {
    filterParts.push(`format:=${filters.format}`);
  }

  if (filters.genre) {
    filterParts.push(`genre:=${filters.genre}`);
  }

  if (typeof filters.maxFeeUsd === "number") {
    filterParts.push(`feeUsd:<=${filters.maxFeeUsd}`);
  }

  if (filters.deadlineBefore) {
    const ts = Math.floor(new Date(filters.deadlineBefore).getTime() / 1000);
    filterParts.push(`deadline:<${ts}`);
  }

  const searchParams: SearchParams<CompetitionDocument> = {
    q: filters.query ?? "*",
    query_by: "title,description",
    query_by_weights: "3,1",
    prefix: "true,true",
    filter_by: filterParts.length > 0 ? filterParts.join(" && ") : undefined,
    sort_by: filters.query ? "_text_match:desc,createdAt:desc" : "createdAt:desc",
    facet_by: "format,genre,accessType",
    per_page: 100,
    page: 1
  };

  const result = await client
    .collections<CompetitionDocument>(COMPETITIONS_COLLECTION)
    .documents()
    .search(searchParams);

  const hits = (result.hits ?? [])
    .map((hit) => hit.document)
    .filter((document): document is CompetitionDocument => document != null);

  const facets: Record<string, Array<{ value: string; count: number }>> = {};
  for (const facet of result.facet_counts ?? []) {
    facets[String(facet.field_name)] = facet.counts.map((count) => ({
      value: count.value,
      count: count.count
    }));
  }

  return {
    hits,
    found: result.found,
    searchTimeMs: result.search_time_ms,
    facets
  };
}

export async function upsertCompetitionDocument(doc: CompetitionDocument): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  await client.collections<CompetitionDocument>(COMPETITIONS_COLLECTION).documents().upsert(doc);
}

export async function deleteCompetitionDocument(id: string): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  try {
    await client.collections(COMPETITIONS_COLLECTION).documents(id).delete();
  } catch {
    return;
  }
}
