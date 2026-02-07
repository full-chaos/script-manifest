import assert from "node:assert/strict";
import test from "node:test";
import type {
  NotificationEventEnvelope,
  Project,
  ProjectCoWriter,
  ProjectCoWriterCreateRequest,
  ProjectCreateRequest,
  ProjectDraft,
  ProjectDraftCreateRequest,
  ProjectDraftUpdateRequest,
  ProjectFilters,
  ProjectUpdateRequest,
  WriterProfile,
  WriterProfileUpdateRequest
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { ProfileProjectRepository } from "./repository.js";

class MemoryRepository implements ProfileProjectRepository {
  private users = new Set<string>(["writer_01", "writer_02", "writer_03"]);
  private profiles = new Map<string, WriterProfile>();
  private projects = new Map<string, Project>();
  private coWriters = new Map<string, ProjectCoWriter[]>();
  private drafts = new Map<string, ProjectDraft[]>();
  private nextProject = 1;
  private nextDraft = 1;

  constructor() {
    this.profiles.set("writer_01", {
      id: "writer_01",
      displayName: "Writer One",
      bio: "",
      genres: ["Drama"],
      representationStatus: "unrepresented"
    });
  }

  async init(): Promise<void> {}

  async userExists(userId: string): Promise<boolean> {
    return this.users.has(userId);
  }

  async getProfile(writerId: string): Promise<WriterProfile | null> {
    return this.profiles.get(writerId) ?? null;
  }

  async upsertProfile(
    writerId: string,
    update: WriterProfileUpdateRequest
  ): Promise<WriterProfile | null> {
    const existing = this.profiles.get(writerId);
    if (!existing) {
      return null;
    }

    const next = {
      ...existing,
      ...update
    };
    this.profiles.set(writerId, next);
    return next;
  }

  async createProject(input: ProjectCreateRequest): Promise<Project | null> {
    if (!this.profiles.has(input.ownerUserId)) {
      return null;
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: `project_${this.nextProject}`,
      ownerUserId: input.ownerUserId,
      title: input.title,
      logline: input.logline,
      synopsis: input.synopsis,
      format: input.format,
      genre: input.genre,
      pageCount: input.pageCount,
      isDiscoverable: input.isDiscoverable,
      createdAt: now,
      updatedAt: now
    };
    this.nextProject += 1;
    this.projects.set(project.id, project);
    return project;
  }

  async listProjects(filters: ProjectFilters): Promise<Project[]> {
    return Array.from(this.projects.values()).filter((project) => {
      if (filters.ownerUserId && project.ownerUserId !== filters.ownerUserId) {
        return false;
      }
      if (filters.genre && project.genre !== filters.genre) {
        return false;
      }
      if (filters.format && project.format !== filters.format) {
        return false;
      }
      return true;
    });
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.projects.get(projectId) ?? null;
  }

  async updateProject(projectId: string, update: ProjectUpdateRequest): Promise<Project | null> {
    const existing = this.projects.get(projectId);
    if (!existing) {
      return null;
    }

    const next = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString()
    };
    this.projects.set(projectId, next);
    return next;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    return this.projects.delete(projectId);
  }

  async listCoWriters(projectId: string): Promise<ProjectCoWriter[]> {
    return [...(this.coWriters.get(projectId) ?? [])].sort(
      (left, right) => left.creditOrder - right.creditOrder
    );
  }

  async addCoWriter(
    projectId: string,
    input: ProjectCoWriterCreateRequest
  ): Promise<ProjectCoWriter | null> {
    const project = this.projects.get(projectId);
    if (!project || !this.users.has(input.coWriterUserId)) {
      return null;
    }

    const existing = this.coWriters.get(projectId) ?? [];
    const coWriter: ProjectCoWriter = {
      projectId,
      ownerUserId: project.ownerUserId,
      coWriterUserId: input.coWriterUserId,
      creditOrder: input.creditOrder,
      createdAt: new Date().toISOString()
    };
    const filtered = existing.filter((entry) => entry.coWriterUserId !== input.coWriterUserId);
    this.coWriters.set(projectId, [...filtered, coWriter]);
    return coWriter;
  }

  async removeCoWriter(projectId: string, coWriterUserId: string): Promise<boolean> {
    const existing = this.coWriters.get(projectId) ?? [];
    const next = existing.filter((entry) => entry.coWriterUserId !== coWriterUserId);
    this.coWriters.set(projectId, next);
    return existing.length !== next.length;
  }

  async listDrafts(projectId: string): Promise<ProjectDraft[]> {
    return [...(this.drafts.get(projectId) ?? [])].sort((left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary)
    );
  }

  async createDraft(projectId: string, input: ProjectDraftCreateRequest): Promise<ProjectDraft | null> {
    const project = this.projects.get(projectId);
    if (!project || project.ownerUserId !== input.ownerUserId) {
      return null;
    }

    const existing = this.drafts.get(projectId) ?? [];
    const shouldSetPrimary = input.setPrimary || existing.every((entry) => !entry.isPrimary);
    const now = new Date().toISOString();
    const nextExisting = shouldSetPrimary
      ? existing.map((entry) => ({ ...entry, isPrimary: false, updatedAt: now }))
      : existing;
    const draft: ProjectDraft = {
      id: `draft_${this.nextDraft}`,
      projectId,
      ownerUserId: input.ownerUserId,
      scriptId: input.scriptId,
      versionLabel: input.versionLabel,
      changeSummary: input.changeSummary,
      pageCount: input.pageCount,
      lifecycleState: "active",
      isPrimary: shouldSetPrimary,
      createdAt: now,
      updatedAt: now
    };
    this.nextDraft += 1;
    this.drafts.set(projectId, [...nextExisting, draft]);
    return draft;
  }

  async updateDraft(
    projectId: string,
    draftId: string,
    update: ProjectDraftUpdateRequest
  ): Promise<ProjectDraft | null> {
    const existing = this.drafts.get(projectId) ?? [];
    const index = existing.findIndex((entry) => entry.id === draftId);
    if (index < 0) {
      return null;
    }

    const current = existing[index]!;
    let next: ProjectDraft = {
      ...current,
      ...update,
      updatedAt: new Date().toISOString()
    };

    const updatedRows = [...existing];
    updatedRows[index] = next;

    if (next.lifecycleState === "archived" && next.isPrimary) {
      next = { ...next, isPrimary: false, updatedAt: new Date().toISOString() };
      updatedRows[index] = next;
      const fallbackIndex = updatedRows.findIndex(
        (entry) => entry.id !== draftId && entry.lifecycleState === "active"
      );
      if (fallbackIndex >= 0) {
        updatedRows[fallbackIndex] = {
          ...updatedRows[fallbackIndex]!,
          isPrimary: true,
          updatedAt: new Date().toISOString()
        };
      }
    }

    this.drafts.set(projectId, updatedRows);
    return next;
  }

  async setPrimaryDraft(
    projectId: string,
    draftId: string,
    ownerUserId: string
  ): Promise<ProjectDraft | null> {
    const project = this.projects.get(projectId);
    if (!project || project.ownerUserId !== ownerUserId) {
      return null;
    }

    const existing = this.drafts.get(projectId) ?? [];
    const candidate = existing.find((entry) => entry.id === draftId && entry.lifecycleState === "active");
    if (!candidate) {
      return null;
    }

    const now = new Date().toISOString();
    const next = existing.map((entry) => ({
      ...entry,
      isPrimary: entry.id === draftId,
      updatedAt: now
    }));
    this.drafts.set(projectId, next);
    return next.find((entry) => entry.id === draftId) ?? null;
  }
}

test("profile-project-service returns profile when available", async (t) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepository(),
    publisher: async () => undefined
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/internal/profiles/writer_01" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().profile.id, "writer_01");
});

test("profile-project-service supports project CRUD", async (t) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepository(),
    publisher: async () => undefined
  });
  t.after(async () => {
    await server.close();
  });

  const create = await server.inject({
    method: "POST",
    url: "/internal/projects",
    payload: {
      ownerUserId: "writer_01",
      title: "My Script",
      logline: "A writer chases momentum",
      synopsis: "",
      format: "feature",
      genre: "drama",
      pageCount: 110,
      isDiscoverable: true
    }
  });
  assert.equal(create.statusCode, 201);
  const projectId = create.json().project.id as string;

  const list = await server.inject({
    method: "GET",
    url: "/internal/projects?ownerUserId=writer_01"
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().projects.length, 1);

  const update = await server.inject({
    method: "PUT",
    url: `/internal/projects/${projectId}`,
    headers: {
      "x-auth-user-id": "writer_01"
    },
    payload: {
      title: "My Script Revised"
    }
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.json().project.title, "My Script Revised");

  const remove = await server.inject({
    method: "DELETE",
    url: `/internal/projects/${projectId}`,
    headers: {
      "x-auth-user-id": "writer_01"
    }
  });
  assert.equal(remove.statusCode, 200);
  assert.equal(remove.json().deleted, true);
});

test("profile-project-service returns 404 for unknown records", async (t) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepository(),
    publisher: async () => undefined
  });
  t.after(async () => {
    await server.close();
  });

  const profile = await server.inject({
    method: "GET",
    url: "/internal/profiles/unknown_writer"
  });
  assert.equal(profile.statusCode, 404);
  assert.equal(profile.json().error, "profile_not_found");

  const project = await server.inject({
    method: "GET",
    url: "/internal/projects/project_missing"
  });
  assert.equal(project.statusCode, 404);
  assert.equal(project.json().error, "project_not_found");
});

test("profile-project-service supports co-writer and draft lifecycle endpoints", async (t) => {
  const server = buildServer({
    logger: false,
    repository: new MemoryRepository(),
    publisher: async () => undefined
  });
  t.after(async () => {
    await server.close();
  });

  const create = await server.inject({
    method: "POST",
    url: "/internal/projects",
    payload: {
      ownerUserId: "writer_01",
      title: "Co-Writer Project",
      logline: "Two writers collaborate",
      synopsis: "",
      format: "feature",
      genre: "thriller",
      pageCount: 99,
      isDiscoverable: true
    }
  });
  assert.equal(create.statusCode, 201);
  const projectId = create.json().project.id as string;

  const addCoWriter = await server.inject({
    method: "POST",
    url: `/internal/projects/${projectId}/co-writers`,
    headers: {
      "x-auth-user-id": "writer_01"
    },
    payload: {
      coWriterUserId: "writer_02",
      creditOrder: 2
    }
  });
  assert.equal(addCoWriter.statusCode, 201);

  const listCoWriters = await server.inject({
    method: "GET",
    url: `/internal/projects/${projectId}/co-writers`
  });
  assert.equal(listCoWriters.statusCode, 200);
  assert.equal(listCoWriters.json().coWriters.length, 1);

  const draftOne = await server.inject({
    method: "POST",
    url: `/internal/projects/${projectId}/drafts`,
    payload: {
      ownerUserId: "writer_01",
      scriptId: "script_a",
      versionLabel: "v1",
      changeSummary: "initial",
      pageCount: 99,
      setPrimary: true
    }
  });
  assert.equal(draftOne.statusCode, 201);
  const draftOneId = draftOne.json().draft.id as string;

  const draftTwo = await server.inject({
    method: "POST",
    url: `/internal/projects/${projectId}/drafts`,
    payload: {
      ownerUserId: "writer_01",
      scriptId: "script_b",
      versionLabel: "v2",
      changeSummary: "revisions",
      pageCount: 102,
      setPrimary: false
    }
  });
  assert.equal(draftTwo.statusCode, 201);
  const draftTwoId = draftTwo.json().draft.id as string;

  const setPrimary = await server.inject({
    method: "POST",
    url: `/internal/projects/${projectId}/drafts/${draftTwoId}/primary`,
    payload: {
      ownerUserId: "writer_01"
    }
  });
  assert.equal(setPrimary.statusCode, 200);
  assert.equal(setPrimary.json().draft.id, draftTwoId);
  assert.equal(setPrimary.json().draft.isPrimary, true);

  const archivePrimary = await server.inject({
    method: "PATCH",
    url: `/internal/projects/${projectId}/drafts/${draftTwoId}`,
    headers: {
      "x-auth-user-id": "writer_01"
    },
    payload: {
      lifecycleState: "archived"
    }
  });
  assert.equal(archivePrimary.statusCode, 200);
  assert.equal(archivePrimary.json().draft.lifecycleState, "archived");

  const drafts = await server.inject({
    method: "GET",
    url: `/internal/projects/${projectId}/drafts`
  });
  assert.equal(drafts.statusCode, 200);
  const draftRows = drafts.json().drafts as ProjectDraft[];
  assert.equal(draftRows.length, 2);
  const restoredPrimary = draftRows.find((entry) => entry.id === draftOneId);
  assert.equal(restoredPrimary?.isPrimary, true);

  const removeCoWriter = await server.inject({
    method: "DELETE",
    url: `/internal/projects/${projectId}/co-writers/writer_02`,
    headers: {
      "x-auth-user-id": "writer_01"
    }
  });
  assert.equal(removeCoWriter.statusCode, 200);
});

test("profile-project-service records access request and emits notification", async (t) => {
  const published: NotificationEventEnvelope[] = [];
  const server = buildServer({
    logger: false,
    repository: new MemoryRepository(),
    publisher: async (event) => {
      published.push(event);
    }
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/scripts/script_123/access-requests",
    payload: {
      requesterUserId: "writer_02",
      ownerUserId: "writer_01"
    }
  });

  assert.equal(response.statusCode, 202);
  assert.equal(published.length, 1);
  assert.equal(published[0]?.eventType, "script_access_requested");
});
