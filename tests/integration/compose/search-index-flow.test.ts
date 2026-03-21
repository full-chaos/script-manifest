import assert from "node:assert/strict";
import test from "node:test";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, makeUnique, registerUser } from "./helpers.js";

type SearchEntry = {
  id?: string;
  projectId?: string;
  title?: string;
  name?: string;
};

type SearchResponse = {
  results?: SearchEntry[];
  items?: SearchEntry[];
  projects?: SearchEntry[];
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("compose flow: create project then query search index for indexed result", async () => {
  const session = await registerUser("search-index-flow");
  const uniqueTitle = makeUnique("search_index_project");

  const project = await expectOkJson<{ project: { id: string; title: string } }>(`${API_BASE_URL}/api/v1/projects`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(session.token)
    },
    body: JSON.stringify({
      title: uniqueTitle,
      logline: "Project used for search indexing integration flow.",
      synopsis: "Exercise async indexing and search query path.",
      format: "feature",
      genre: "drama",
      pageCount: 108,
      isDiscoverable: true
    })
  }, 201);
  const projectId = project.project.id;
  assert.ok(projectId.length > 0);

  let found = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await jsonRequest<SearchResponse>(
      `${API_BASE_URL}/api/v1/search?q=${encodeURIComponent(uniqueTitle)}`,
      { method: "GET" }
    );

    if (search.status === 200) {
      const entries = [
        ...(search.body.results ?? []),
        ...(search.body.items ?? []),
        ...(search.body.projects ?? [])
      ];

      found = entries.some((entry) => {
        const candidateId = entry.projectId ?? entry.id;
        const candidateTitle = entry.title ?? entry.name;
        return candidateId === projectId || candidateTitle === uniqueTitle;
      });
      if (found) {
        break;
      }
    }

    await wait(500);
  }

  assert.equal(found, true, "expected search results to include newly created project");
});
