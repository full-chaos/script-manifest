import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndustryAccount,
  IndustryAccountCreateInternal,
  IndustryAccountVerificationRequest,
  IndustryEntitlement,
  IndustryEntitlementUpsertRequest
} from "@script-manifest/contracts";
import { buildServer } from "./index.js";
import type {
  IndustryAccountCreateResult,
  IndustryPortalRepository
} from "./repository.js";

class MemoryRepository implements IndustryPortalRepository {
  private users = new Set<string>(["writer_01", "industry_01", "admin_01"]);
  private accounts = new Map<string, IndustryAccount>();
  private entitlements = new Map<string, IndustryEntitlement>();

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
  const created = await repository.createAccount({
    userId: "industry_01",
    companyName: "Studio One",
    roleTitle: "Manager",
    professionalEmail: "exec@studioone.com",
    websiteUrl: "",
    linkedinUrl: "",
    imdbUrl: ""
  });
  assert.equal(created.status, "created");
  const accountId = created.status === "created" ? created.account.id : "";

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
  const created = await repository.createAccount({
    userId: "industry_01",
    companyName: "Studio One",
    roleTitle: "Manager",
    professionalEmail: "exec@studioone.com",
    websiteUrl: "",
    linkedinUrl: "",
    imdbUrl: ""
  });
  assert.equal(created.status, "created");
  const accountId = created.status === "created" ? created.account.id : "";

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
