import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndustryAccount,
  IndustryAccountCreateInternal,
  IndustryAccountVerificationRequest,
  IndustryEntitlement,
  IndustryEntitlementUpsertRequest,
  IndustryList,
  IndustryListCreateRequest,
  IndustryListItem,
  IndustryListItemCreateRequest,
  IndustryMandate,
  IndustryMandateCreateRequest,
  IndustryMandateFilters,
  IndustryMandateSubmission,
  IndustryMandateSubmissionCreateRequest,
  IndustryNote,
  IndustryNoteCreateRequest,
  IndustryTalentSearchFilters,
  IndustryTalentSearchResult,
  WriterProfile
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type {
  IndustryAccountCreateResult,
  IndustryMandatesPage,
  IndustryPortalRepository,
  IndustryTalentSearchPage
} from "./repository.js";

type ProjectRecord = {
  id: string;
  ownerUserId: string;
  title: string;
  logline: string;
  synopsis: string;
  format: string;
  genre: string;
  isDiscoverable: boolean;
};

class MemoryRepository implements IndustryPortalRepository {
  private users = new Set<string>(["writer_01", "writer_02", "industry_01", "admin_01"]);
  private accounts = new Map<string, IndustryAccount>();
  private entitlements = new Map<string, IndustryEntitlement>();
  private lists = new Map<string, IndustryList>();
  private listItems = new Map<string, IndustryListItem>();
  private notes = new Map<string, IndustryNote>();
  private mandates = new Map<string, IndustryMandate>();
  private mandateSubmissions = new Map<string, IndustryMandateSubmission>();
  private profiles = new Map<string, WriterProfile>([
    ["writer_01", {
      id: "writer_01",
      displayName: "Writer One",
      bio: "Bio one",
      genres: ["Drama", "Thriller"],
      demographics: ["LGBTQ+"],
      representationStatus: "seeking_rep",
      headshotUrl: "",
      customProfileUrl: "",
      isSearchable: true
    }],
    ["writer_02", {
      id: "writer_02",
      displayName: "Writer Two",
      bio: "Bio two",
      genres: ["Comedy"],
      demographics: ["Veteran"],
      representationStatus: "represented",
      headshotUrl: "",
      customProfileUrl: "",
      isSearchable: true
    }]
  ]);
  private projects = new Map<string, ProjectRecord>([
    ["project_01", {
      id: "project_01",
      ownerUserId: "writer_01",
      title: "Contained Drama",
      logline: "A family must reunite in one night.",
      synopsis: "A contained drama set during one stormy evening.",
      format: "feature",
      genre: "Drama",
      isDiscoverable: true
    }],
    ["project_02", {
      id: "project_02",
      ownerUserId: "writer_02",
      title: "Workplace Comedy",
      logline: "An office team survives a merger.",
      synopsis: "Ensemble comedy pilot with heart.",
      format: "pilot",
      genre: "Comedy",
      isDiscoverable: true
    }]
  ]);

  async init(): Promise<void> {}

  async healthCheck(): Promise<{ database: boolean }> {
    return { database: true };
  }

  async userExists(userId: string): Promise<boolean> {
    return this.users.has(userId);
  }

  async createAccount(input: IndustryAccountCreateInternal): Promise<IndustryAccountCreateResult> {
    if (!(await this.userExists(input.userId))) {
      return { status: "user_not_found" };
    }
    const existing = [...this.accounts.values()].find((account) => account.userId === input.userId);
    if (existing) {
      return { status: "already_exists", account: existing };
    }

    const now = new Date().toISOString();
    const account: IndustryAccount = {
      id: `industry_account_${this.accounts.size + 1}`,
      userId: input.userId,
      companyName: input.companyName,
      roleTitle: input.roleTitle,
      professionalEmail: input.professionalEmail,
      websiteUrl: input.websiteUrl,
      linkedinUrl: input.linkedinUrl,
      imdbUrl: input.imdbUrl,
      verificationStatus: "pending_review",
      verificationNotes: null,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.accounts.set(account.id, account);
    return { status: "created", account };
  }

  async getAccountById(accountId: string): Promise<IndustryAccount | null> {
    return this.accounts.get(accountId) ?? null;
  }

  async getAccountByUserId(userId: string): Promise<IndustryAccount | null> {
    return [...this.accounts.values()].find((account) => account.userId === userId) ?? null;
  }

  async verifyAccount(
    accountId: string,
    reviewerUserId: string,
    input: IndustryAccountVerificationRequest
  ): Promise<IndustryAccount | null> {
    if (!(await this.userExists(reviewerUserId))) {
      return null;
    }

    const account = this.accounts.get(accountId);
    if (!account) {
      return null;
    }
    const next: IndustryAccount = {
      ...account,
      verificationStatus: input.status,
      verificationNotes: input.verificationNotes,
      verifiedByUserId: reviewerUserId,
      verifiedAt: input.status === "verified" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    };
    this.accounts.set(accountId, next);
    return next;
  }

  async upsertEntitlement(
    writerUserId: string,
    grantedByUserId: string,
    input: IndustryEntitlementUpsertRequest
  ): Promise<IndustryEntitlement | null> {
    if (!(await this.userExists(writerUserId)) || !(await this.userExists(grantedByUserId))) {
      return null;
    }
    if (!(await this.getAccountById(input.industryAccountId))) {
      return null;
    }
    const now = new Date().toISOString();
    const key = `${writerUserId}:${input.industryAccountId}`;
    const existing = this.entitlements.get(key);
    const entitlement: IndustryEntitlement = {
      writerUserId,
      industryAccountId: input.industryAccountId,
      accessLevel: input.accessLevel,
      grantedByUserId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.entitlements.set(key, entitlement);
    return entitlement;
  }

  async getEntitlement(
    writerUserId: string,
    industryAccountId: string
  ): Promise<IndustryEntitlement | null> {
    return this.entitlements.get(`${writerUserId}:${industryAccountId}`) ?? null;
  }

  async searchTalent(filters: IndustryTalentSearchFilters): Promise<IndustryTalentSearchPage> {
    const q = (filters.q ?? "").toLowerCase();
    const filtered = [...this.projects.values()].filter((project) => {
      if (!project.isDiscoverable) {
        return false;
      }
      const profile = this.profiles.get(project.ownerUserId);
      if (!profile || !profile.isSearchable) {
        return false;
      }
      if (filters.genre && project.genre !== filters.genre) {
        return false;
      }
      if (filters.format && project.format !== filters.format) {
        return false;
      }
      if (filters.representationStatus && profile.representationStatus !== filters.representationStatus) {
        return false;
      }
      if (q.length > 0) {
        const matches = profile.displayName.toLowerCase().includes(q)
          || project.title.toLowerCase().includes(q)
          || project.logline.toLowerCase().includes(q)
          || project.synopsis.toLowerCase().includes(q);
        if (!matches) {
          return false;
        }
      }
      return true;
    });

    const total = filtered.length;
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    const results: IndustryTalentSearchResult[] = filtered.slice(offset, offset + limit).map((project) => {
      const profile = this.profiles.get(project.ownerUserId)!;
      return {
        writerId: profile.id,
        displayName: profile.displayName,
        representationStatus: profile.representationStatus,
        genres: profile.genres,
        demographics: profile.demographics,
        projectId: project.id,
        projectTitle: project.title,
        projectFormat: project.format,
        projectGenre: project.genre,
        logline: project.logline,
        synopsis: project.synopsis
      };
    });

    return { results, total, limit, offset };
  }

  async listLists(industryAccountId: string): Promise<IndustryList[]> {
    return [...this.lists.values()].filter((list) => list.industryAccountId === industryAccountId);
  }

  async createList(
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryListCreateRequest
  ): Promise<IndustryList | null> {
    if (!(await this.getAccountById(industryAccountId))) {
      return null;
    }
    if (!(await this.userExists(createdByUserId))) {
      return null;
    }
    const now = new Date().toISOString();
    const list: IndustryList = {
      id: `industry_list_${this.lists.size + 1}`,
      industryAccountId,
      name: input.name,
      description: input.description,
      createdByUserId,
      isShared: input.isShared,
      createdAt: now,
      updatedAt: now
    };
    this.lists.set(list.id, list);
    return list;
  }

  async addListItem(
    listId: string,
    industryAccountId: string,
    addedByUserId: string,
    input: IndustryListItemCreateRequest
  ): Promise<IndustryListItem | null> {
    const list = this.lists.get(listId);
    if (!list || list.industryAccountId !== industryAccountId) {
      return null;
    }
    if (!(await this.userExists(addedByUserId)) || !(await this.userExists(input.writerUserId))) {
      return null;
    }
    if (input.projectId) {
      const project = this.projects.get(input.projectId);
      if (!project || project.ownerUserId !== input.writerUserId) {
        return null;
      }
    }
    const item: IndustryListItem = {
      id: `industry_list_item_${this.listItems.size + 1}`,
      listId,
      writerUserId: input.writerUserId,
      projectId: input.projectId ?? null,
      addedByUserId,
      createdAt: new Date().toISOString()
    };
    this.listItems.set(item.id, item);
    return item;
  }

  async addListNote(
    listId: string,
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryNoteCreateRequest
  ): Promise<IndustryNote | null> {
    const list = this.lists.get(listId);
    if (!list || list.industryAccountId !== industryAccountId) {
      return null;
    }
    if (!(await this.userExists(createdByUserId))) {
      return null;
    }
    if (input.writerUserId && !(await this.userExists(input.writerUserId))) {
      return null;
    }
    if (input.projectId && !this.projects.has(input.projectId)) {
      return null;
    }
    const now = new Date().toISOString();
    const note: IndustryNote = {
      id: `industry_note_${this.notes.size + 1}`,
      listId,
      writerUserId: input.writerUserId ?? null,
      projectId: input.projectId ?? null,
      body: input.body,
      createdByUserId,
      createdAt: now,
      updatedAt: now
    };
    this.notes.set(note.id, note);
    return note;
  }

  async listMandates(filters: IndustryMandateFilters): Promise<IndustryMandatesPage> {
    const filtered = [...this.mandates.values()].filter((mandate) => {
      if (filters.type && mandate.type !== filters.type) {
        return false;
      }
      if (filters.status && mandate.status !== filters.status) {
        return false;
      }
      if (filters.format && mandate.format !== filters.format) {
        return false;
      }
      if (filters.genre && mandate.genre !== filters.genre) {
        return false;
      }
      return true;
    });
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    return {
      mandates: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset
    };
  }

  async createMandate(
    createdByUserId: string,
    input: IndustryMandateCreateRequest
  ): Promise<IndustryMandate | null> {
    if (!(await this.userExists(createdByUserId))) {
      return null;
    }
    const now = new Date().toISOString();
    const mandate: IndustryMandate = {
      id: `mandate_${this.mandates.size + 1}`,
      type: input.type,
      title: input.title,
      description: input.description,
      format: input.format,
      genre: input.genre,
      status: "open",
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      createdByUserId,
      createdAt: now,
      updatedAt: now
    };
    this.mandates.set(mandate.id, mandate);
    return mandate;
  }

  async createMandateSubmission(
    mandateId: string,
    writerUserId: string,
    input: IndustryMandateSubmissionCreateRequest
  ): Promise<IndustryMandateSubmission | null> {
    if (!(await this.userExists(writerUserId))) {
      return null;
    }
    const project = this.projects.get(input.projectId);
    if (!project || project.ownerUserId !== writerUserId) {
      return null;
    }
    const mandate = this.mandates.get(mandateId);
    if (!mandate || mandate.status !== "open") {
      return null;
    }
    const now = new Date().toISOString();
    const submission: IndustryMandateSubmission = {
      id: `mandate_submission_${this.mandateSubmissions.size + 1}`,
      mandateId,
      writerUserId,
      projectId: input.projectId,
      fitExplanation: input.fitExplanation,
      status: "submitted",
      createdAt: now,
      updatedAt: now
    };
    this.mandateSubmissions.set(submission.id, submission);
    return submission;
  }
}

async function createVerifiedIndustryAccount(repository: MemoryRepository): Promise<string> {
  const createResult = await repository.createAccount({
    userId: "industry_01",
    companyName: "Studio One",
    roleTitle: "Manager",
    professionalEmail: "exec@studioone.com",
    websiteUrl: "",
    linkedinUrl: "",
    imdbUrl: ""
  });
  assert.equal(createResult.status, "created");
  const accountId = createResult.status === "created" ? createResult.account.id : "";
  await repository.verifyAccount(accountId, "admin_01", {
    status: "verified",
    verificationNotes: "validated"
  });
  return accountId;
}

test("industry portal creates account for authenticated user", async (t) => {
  const server = buildServer({ logger: false, repository: new MemoryRepository() });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/accounts",
    headers: { "x-auth-user-id": "industry_01" },
    payload: {
      companyName: "Studio One",
      roleTitle: "Manager",
      professionalEmail: "exec@studioone.com"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().account.userId, "industry_01");
});

test("industry portal verify route updates account status", async (t) => {
  const repository = new MemoryRepository();
  const createResult = await repository.createAccount({
    userId: "industry_01",
    companyName: "Studio One",
    roleTitle: "Manager",
    professionalEmail: "exec@studioone.com",
    websiteUrl: "",
    linkedinUrl: "",
    imdbUrl: ""
  });
  assert.equal(createResult.status, "created");
  const accountId = createResult.status === "created" ? createResult.account.id : "";

  const server = buildServer({ logger: false, repository });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: `/internal/accounts/${accountId}/verify`,
    headers: { "x-admin-user-id": "admin_01" },
    payload: { status: "verified", verificationNotes: "Validated credentials." }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().account.verificationStatus, "verified");
  assert.equal(response.json().account.verifiedByUserId, "admin_01");
});

test("industry entitlement upsert enforces writer ownership", async (t) => {
  const repository = new MemoryRepository();
  const accountId = await createVerifiedIndustryAccount(repository);

  const server = buildServer({ logger: false, repository });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "PUT",
    url: "/internal/entitlements/writer_01",
    headers: { "x-auth-user-id": "writer_02" },
    payload: { industryAccountId: accountId, accessLevel: "download" }
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "PUT",
    url: "/internal/entitlements/writer_01",
    headers: { "x-auth-user-id": "writer_01" },
    payload: { industryAccountId: accountId, accessLevel: "download" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().entitlement.accessLevel, "download");
});

test("industry entitlement check resolves account from industry user id", async (t) => {
  const repository = new MemoryRepository();
  const accountId = await createVerifiedIndustryAccount(repository);

  await repository.upsertEntitlement("writer_01", "writer_01", {
    industryAccountId: accountId,
    accessLevel: "download"
  });

  const server = buildServer({ logger: false, repository });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/internal/entitlements/writer_01/check?industryUserId=industry_01"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().canView, true);
  assert.equal(response.json().canDownload, true);
});

test("industry talent search requires verified account and returns discoverable results", async (t) => {
  const repository = new MemoryRepository();
  const account = await repository.createAccount({
    userId: "industry_01",
    companyName: "Studio One",
    roleTitle: "Manager",
    professionalEmail: "exec@studioone.com",
    websiteUrl: "",
    linkedinUrl: "",
    imdbUrl: ""
  });
  assert.equal(account.status, "created");
  const accountId = account.status === "created" ? account.account.id : "";
  const server = buildServer({ logger: false, repository });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/internal/talent-search?genre=Drama",
    headers: { "x-auth-user-id": "industry_01" }
  });
  assert.equal(forbidden.statusCode, 403);

  await repository.verifyAccount(accountId, "admin_01", {
    status: "verified",
    verificationNotes: "validated"
  });
  const ok = await server.inject({
    method: "GET",
    url: "/internal/talent-search?genre=Drama&format=feature",
    headers: { "x-auth-user-id": "industry_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().results.length, 1);
  assert.equal(ok.json().results[0]?.writerId, "writer_01");
});

test("industry lists support create, item add, and note add", async (t) => {
  const repository = new MemoryRepository();
  await createVerifiedIndustryAccount(repository);
  const server = buildServer({ logger: false, repository });
  t.after(async () => {
    await server.close();
  });

  const created = await server.inject({
    method: "POST",
    url: "/internal/lists",
    headers: { "x-auth-user-id": "industry_01" },
    payload: { name: "Drama Prospects", description: "Round one", isShared: true }
  });
  assert.equal(created.statusCode, 201);
  const listId = created.json().list.id as string;

  const item = await server.inject({
    method: "POST",
    url: `/internal/lists/${listId}/items`,
    headers: { "x-auth-user-id": "industry_01" },
    payload: { writerUserId: "writer_01", projectId: "project_01" }
  });
  assert.equal(item.statusCode, 201);
  assert.equal(item.json().item.writerUserId, "writer_01");

  const note = await server.inject({
    method: "POST",
    url: `/internal/lists/${listId}/notes`,
    headers: { "x-auth-user-id": "industry_01" },
    payload: { writerUserId: "writer_01", body: "Strong voice and clear stakes." }
  });
  assert.equal(note.statusCode, 201);
  assert.equal(note.json().note.body, "Strong voice and clear stakes.");
});

test("industry mandates support create and writer submission", async (t) => {
  const repository = new MemoryRepository();
  const server = buildServer({ logger: false, repository });
  t.after(async () => {
    await server.close();
  });

  const created = await server.inject({
    method: "POST",
    url: "/internal/mandates",
    headers: { "x-admin-user-id": "admin_01" },
    payload: {
      type: "mandate",
      title: "Contained thrillers wanted",
      description: "Producer request",
      format: "feature",
      genre: "Thriller",
      opensAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2027-01-01T00:00:00.000Z"
    }
  });
  assert.equal(created.statusCode, 201);
  const mandateId = created.json().mandate.id as string;

  const list = await server.inject({
    method: "GET",
    url: "/internal/mandates?status=open"
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().mandates.length, 1);

  const submission = await server.inject({
    method: "POST",
    url: `/internal/mandates/${mandateId}/submissions`,
    headers: { "x-auth-user-id": "writer_01" },
    payload: { projectId: "project_01", fitExplanation: "Matches budget and tone." }
  });
  assert.equal(submission.statusCode, 201);
  assert.equal(submission.json().submission.status, "submitted");
});
