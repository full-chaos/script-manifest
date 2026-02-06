import assert from "node:assert/strict";
import test from "node:test";
import type {
  NotificationEventEnvelope,
  Project,
  ProjectCreateRequest,
  ProjectFilters,
  ProjectUpdateRequest,
  WriterProfile,
  WriterProfileUpdateRequest
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type { ProfileProjectRepository } from "./repository.js";

class MemoryRepository implements ProfileProjectRepository {
  private profiles = new Map<string, WriterProfile>();
  private projects = new Map<string, Project>();
  private nextProject = 1;

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
    payload: {
      title: "My Script Revised"
    }
  });
  assert.equal(update.statusCode, 200);
  assert.equal(update.json().project.title, "My Script Revised");

  const remove = await server.inject({
    method: "DELETE",
    url: `/internal/projects/${projectId}`
  });
  assert.equal(remove.statusCode, 200);
  assert.equal(remove.json().deleted, true);
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
