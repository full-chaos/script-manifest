import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections.js";
import type { SearchParams } from "typesense/lib/Typesense/Documents.js";
import { getTypesenseClient } from "../client.js";

export const PROJECTS_COLLECTION = "projects";

export const projectsSchema: CollectionCreateSchema = {
  name: PROJECTS_COLLECTION,
  fields: [
    { name: "id", type: "string" },
    { name: "ownerUserId", type: "string" },
    { name: "title", type: "string" },
    { name: "logline", type: "string", optional: true },
    { name: "synopsis", type: "string", optional: true },
    { name: "format", type: "string", facet: true },
    { name: "genre", type: "string", facet: true },
    { name: "pageCount", type: "int32", optional: true },
    { name: "isDiscoverable", type: "bool" },
    { name: "updatedAt", type: "int64" },
  ],
  default_sorting_field: "updatedAt",
};

export type ProjectDocument = {
  id: string;
  ownerUserId: string;
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  pageCount: number;
  isDiscoverable: boolean;
  updatedAt: number;
};

export async function ensureProjectsCollection(): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  try {
    await client.collections(PROJECTS_COLLECTION).retrieve();
  } catch {
    await client.collections().create(projectsSchema);
  }
}

export async function searchProjects(filters: {
  q?: string;
  format?: string;
  genre?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  hits: ProjectDocument[];
  found: number;
  searchTimeMs: number;
  facets: Record<string, Array<{ value: string; count: number }>>;
} | null> {
  const client = getTypesenseClient();
  if (!client) return null;

  const filterParts: string[] = ["isDiscoverable:=true"];

  if (filters.format) {
    filterParts.push(`format:=${filters.format}`);
  }
  if (filters.genre) {
    filterParts.push(`genre:=${filters.genre}`);
  }

  const hasQuery = filters.q && filters.q.trim().length > 0;

  const searchParams: SearchParams<ProjectDocument> = {
    q: hasQuery ? filters.q! : "*",
    query_by: "title,logline,synopsis",
    query_by_weights: "3,2,1",
    prefix: "true,true,true",
    filter_by: filterParts.join(" && "),
    sort_by: hasQuery ? "_text_match:desc,updatedAt:desc" : "updatedAt:desc",
    facet_by: "format,genre",
    per_page: filters.limit ?? 20,
    page: Math.floor((filters.offset ?? 0) / (filters.limit ?? 20)) + 1,
  };

  const result = await client
    .collections<ProjectDocument>(PROJECTS_COLLECTION)
    .documents()
    .search(searchParams);

  const hits = (result.hits ?? [])
    .map((hit) => hit.document)
    .filter((doc): doc is ProjectDocument => doc != null);

  const facets: Record<string, Array<{ value: string; count: number }>> = {};
  for (const facet of result.facet_counts ?? []) {
    facets[String(facet.field_name)] = facet.counts.map((c) => ({
      value: c.value,
      count: c.count,
    }));
  }

  return { hits, found: result.found, searchTimeMs: result.search_time_ms, facets };
}

export async function upsertProjectDocument(doc: ProjectDocument): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  await client.collections<ProjectDocument>(PROJECTS_COLLECTION).documents().upsert(doc);
}

export async function deleteProjectDocument(id: string): Promise<void> {
  const client = getTypesenseClient();
  if (!client) return;

  try {
    await client.collections(PROJECTS_COLLECTION).documents(id).delete();
  } catch {
    return;
  }
}
