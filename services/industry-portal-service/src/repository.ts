import { randomUUID } from "node:crypto";
import {
  type IndustryActivity,
  type IndustryAccount,
  IndustryAccountCreateInternalSchema,
  type IndustryAccountCreateInternal,
  type IndustryAccountVerificationRequest,
  IndustryAccountSchema,
  type IndustryAnalyticsSummary,
  IndustryAnalyticsSummarySchema,
  type IndustryDigestRecommendation,
  type IndustryDigestRun,
  IndustryDigestRunSchema,
  type IndustryEntitlementAccessLevel,
  type IndustryEntitlement,
  type IndustryEntitlementUpsertRequest,
  IndustryEntitlementSchema,
  type IndustryList,
  type IndustryListCreateRequest,
  type IndustryListItem,
  type IndustryListItemCreateRequest,
  IndustryListItemSchema,
  type IndustryListShareTeamRequest,
  IndustryListSchema,
  type IndustryMandate,
  type IndustryMandateCreateRequest,
  type IndustryMandateFilters,
  type IndustryMandateSubmission,
  type IndustryMandateSubmissionCreateRequest,
  type IndustryMandateSubmissionReviewRequest,
  IndustryMandateSchema,
  IndustryMandateSubmissionSchema,
  type IndustryNote,
  type IndustryNoteCreateRequest,
  IndustryNoteSchema,
  type IndustryTeam,
  type IndustryTeamCreateRequest,
  IndustryTeamMemberSchema,
  type IndustryTeamMember,
  type IndustryTeamMemberUpsertRequest,
  IndustryTeamSchema,
  type IndustryTalentSearchFilters,
  type IndustryTalentSearchResult,
  IndustryTalentSearchResultSchema,
  type IndustryWeeklyDigestRunRequest
} from "@script-manifest/contracts";
import {
  ensureCoreTables,
  ensureIndustryPortalTables,
  getPool
} from "@script-manifest/db";

export type IndustryAccountCreateResult =
  | { status: "created"; account: IndustryAccount }
  | { status: "user_not_found" }
  | { status: "already_exists"; account: IndustryAccount };

export type IndustryTalentSearchPage = {
  results: IndustryTalentSearchResult[];
  total: number;
  limit: number;
  offset: number;
};

export type IndustryMandatesPage = {
  mandates: IndustryMandate[];
  total: number;
  limit: number;
  offset: number;
};

export type IndustryActivityPage = {
  entries: IndustryActivity[];
  total: number;
  limit: number;
  offset: number;
};

export type IndustryDigestRunsPage = {
  runs: IndustryDigestRun[];
  total: number;
  limit: number;
  offset: number;
};

export type IndustryAccessContext = {
  industryAccountId: string;
  role: "owner" | "editor" | "viewer";
};

export interface IndustryPortalRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  userExists(userId: string): Promise<boolean>;
  resolveVerifiedAccess(userId: string): Promise<IndustryAccessContext | null>;
  createAccount(input: IndustryAccountCreateInternal): Promise<IndustryAccountCreateResult>;
  getAccountById(accountId: string): Promise<IndustryAccount | null>;
  getAccountByUserId(userId: string): Promise<IndustryAccount | null>;
  verifyAccount(
    accountId: string,
    reviewerUserId: string,
    input: IndustryAccountVerificationRequest
  ): Promise<IndustryAccount | null>;
  upsertEntitlement(
    writerUserId: string,
    grantedByUserId: string,
    input: IndustryEntitlementUpsertRequest
  ): Promise<IndustryEntitlement | null>;
  getEntitlement(
    writerUserId: string,
    industryAccountId: string
  ): Promise<IndustryEntitlement | null>;
  resolveScriptOwnerUserId(scriptId: string): Promise<string | null>;
  recordScriptDownload(input: {
    scriptId: string;
    writerUserId: string;
    industryAccountId: string;
    downloadedByUserId: string;
    source?: string;
  }): Promise<void>;
  rebuildTalentIndex(): Promise<{ indexed: number }>;
  searchTalent(filters: IndustryTalentSearchFilters): Promise<IndustryTalentSearchPage>;
  listLists(industryAccountId: string, actorUserId: string): Promise<IndustryList[]>;
  createList(
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryListCreateRequest
  ): Promise<IndustryList | null>;
  addListItem(
    listId: string,
    industryAccountId: string,
    addedByUserId: string,
    input: IndustryListItemCreateRequest
  ): Promise<IndustryListItem | null>;
  addListNote(
    listId: string,
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryNoteCreateRequest
  ): Promise<IndustryNote | null>;
  listTeams(industryAccountId: string): Promise<IndustryTeam[]>;
  createTeam(
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryTeamCreateRequest
  ): Promise<IndustryTeam | null>;
  upsertTeamMember(
    teamId: string,
    industryAccountId: string,
    actorUserId: string,
    input: IndustryTeamMemberUpsertRequest
  ): Promise<IndustryTeamMember | null>;
  shareListWithTeam(
    listId: string,
    industryAccountId: string,
    actorUserId: string,
    input: IndustryListShareTeamRequest
  ): Promise<boolean>;
  listActivity(
    industryAccountId: string,
    limit: number,
    offset: number
  ): Promise<IndustryActivityPage>;
  listMandates(filters: IndustryMandateFilters): Promise<IndustryMandatesPage>;
  createMandate(
    createdByUserId: string,
    input: IndustryMandateCreateRequest
  ): Promise<IndustryMandate | null>;
  listMandateSubmissions(mandateId: string): Promise<IndustryMandateSubmission[]>;
  createMandateSubmission(
    mandateId: string,
    writerUserId: string,
    input: IndustryMandateSubmissionCreateRequest
  ): Promise<IndustryMandateSubmission | null>;
  reviewMandateSubmission(
    mandateId: string,
    submissionId: string,
    reviewerUserId: string,
    input: IndustryMandateSubmissionReviewRequest
  ): Promise<IndustryMandateSubmission | null>;
  createWeeklyDigestRun(
    industryAccountId: string,
    generatedByUserId: string,
    input: IndustryWeeklyDigestRunRequest
  ): Promise<IndustryDigestRun | null>;
  listWeeklyDigestRuns(
    industryAccountId: string,
    limit: number,
    offset: number
  ): Promise<IndustryDigestRunsPage>;
  getAnalyticsSummary(industryAccountId: string, windowDays: number): Promise<IndustryAnalyticsSummary>;
}

function mapAccount(row: Record<string, unknown>): IndustryAccount {
  return IndustryAccountSchema.parse({
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    roleTitle: row.role_title,
    professionalEmail: row.professional_email,
    websiteUrl: row.website_url ?? "",
    linkedinUrl: row.linkedin_url ?? "",
    imdbUrl: row.imdb_url ?? "",
    verificationStatus: row.verification_status,
    verificationNotes: row.verification_notes ?? null,
    verifiedByUserId: row.verified_by_user_id ?? null,
    verifiedAt: row.verified_at ? new Date(String(row.verified_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapEntitlement(row: Record<string, unknown>): IndustryEntitlement {
  return IndustryEntitlementSchema.parse({
    writerUserId: row.writer_user_id,
    industryAccountId: row.industry_account_id,
    accessLevel: row.access_level,
    grantedByUserId: row.granted_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapIndustryList(row: Record<string, unknown>): IndustryList {
  return IndustryListSchema.parse({
    id: row.id,
    industryAccountId: row.industry_account_id,
    name: row.name,
    description: row.description ?? "",
    createdByUserId: row.created_by_user_id,
    isShared: row.is_shared,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapListItem(row: Record<string, unknown>): IndustryListItem {
  return IndustryListItemSchema.parse({
    id: row.id,
    listId: row.list_id,
    writerUserId: row.writer_user_id,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    addedByUserId: row.added_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString()
  });
}

function mapNote(row: Record<string, unknown>): IndustryNote {
  return IndustryNoteSchema.parse({
    id: row.id,
    listId: row.list_id,
    writerUserId: typeof row.writer_user_id === "string" ? row.writer_user_id : null,
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    body: row.body,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapTeam(row: Record<string, unknown>): IndustryTeam {
  return IndustryTeamSchema.parse({
    id: row.id,
    industryAccountId: row.industry_account_id,
    name: row.name,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapTeamMember(row: Record<string, unknown>): IndustryTeamMember {
  return IndustryTeamMemberSchema.parse({
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    createdAt: new Date(String(row.created_at)).toISOString()
  });
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function mapActivity(row: Record<string, unknown>): IndustryActivity {
  return {
    id: String(row.id),
    industryAccountId: String(row.industry_account_id),
    actorUserId: String(row.actor_user_id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    action: String(row.action),
    metadata: parseJsonObject(row.metadata_json),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapMandate(row: Record<string, unknown>): IndustryMandate {
  return IndustryMandateSchema.parse({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? "",
    format: row.format,
    genre: row.genre,
    status: row.status,
    opensAt: new Date(String(row.opens_at)).toISOString(),
    closesAt: new Date(String(row.closes_at)).toISOString(),
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function mapMandateSubmission(row: Record<string, unknown>): IndustryMandateSubmission {
  return IndustryMandateSubmissionSchema.parse({
    id: row.id,
    mandateId: row.mandate_id,
    writerUserId: row.writer_user_id,
    projectId: row.project_id,
    fitExplanation: row.fit_explanation ?? "",
    status: row.status,
    editorialNotes: row.editorial_notes ?? "",
    reviewedByUserId: typeof row.reviewed_by_user_id === "string" ? row.reviewed_by_user_id : null,
    reviewedAt: row.reviewed_at ? new Date(String(row.reviewed_at)).toISOString() : null,
    forwardedTo: row.forwarded_to ?? "",
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  });
}

function parseRecommendations(value: unknown): IndustryDigestRecommendation[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) {
          return null;
        }
        const item = entry as Record<string, unknown>;
        if (
          typeof item.writerId !== "string"
          || typeof item.projectId !== "string"
          || typeof item.reason !== "string"
          || (item.source !== "algorithm" && item.source !== "override")
        ) {
          return null;
        }
        return {
          writerId: item.writerId,
          projectId: item.projectId,
          reason: item.reason,
          source: item.source
        } satisfies IndustryDigestRecommendation;
      })
      .filter((entry): entry is IndustryDigestRecommendation => entry !== null);
  }

  if (typeof value === "string" && value.length > 0) {
    try {
      return parseRecommendations(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }

  return [];
}

function mapDigestRun(row: Record<string, unknown>): IndustryDigestRun {
  return IndustryDigestRunSchema.parse({
    id: row.id,
    industryAccountId: row.industry_account_id,
    generatedByUserId: row.generated_by_user_id,
    windowStart: new Date(String(row.window_start)).toISOString(),
    windowEnd: new Date(String(row.window_end)).toISOString(),
    candidateCount: Number(row.candidate_count ?? 0),
    recommendations: parseRecommendations(row.recommendations_json),
    overrideWriterIds: Array.isArray(row.override_writer_ids) ? row.override_writer_ids : [],
    notes: row.notes ?? "",
    createdAt: new Date(String(row.created_at)).toISOString()
  });
}

export class PgIndustryPortalRepository implements IndustryPortalRepository {
  async init(): Promise<void> {
    await ensureCoreTables();
    await ensureIndustryPortalTables();
  }

  async healthCheck(): Promise<{ database: boolean }> {
    const db = getPool();
    await db.query("SELECT 1");
    return { database: true };
  }

  async userExists(userId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query("SELECT 1 FROM app_users WHERE id = $1 LIMIT 1", [userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async resolveVerifiedAccess(userId: string): Promise<IndustryAccessContext | null> {
    const ownerAccount = await this.getAccountByUserId(userId);
    if (ownerAccount && ownerAccount.verificationStatus === "verified") {
      return {
        industryAccountId: ownerAccount.id,
        role: "owner"
      };
    }

    const db = getPool();
    const result = await db.query<{
      industry_account_id: string;
      role: "owner" | "editor" | "viewer";
    }>(
      `SELECT
         t.industry_account_id,
         CASE
           WHEN bool_or(tm.role = 'owner') THEN 'owner'
           WHEN bool_or(tm.role = 'editor') THEN 'editor'
           ELSE 'viewer'
         END AS role
       FROM industry_team_members tm
       JOIN industry_teams t ON t.id = tm.team_id
       JOIN industry_accounts ia ON ia.id = t.industry_account_id
      WHERE tm.user_id = $1
        AND ia.verification_status = 'verified'
      GROUP BY t.industry_account_id
      LIMIT 1`,
      [userId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return {
      industryAccountId: result.rows[0]?.industry_account_id ?? "",
      role: result.rows[0]?.role ?? "viewer"
    };
  }

  async createAccount(input: IndustryAccountCreateInternal): Promise<IndustryAccountCreateResult> {
    const parsed = IndustryAccountCreateInternalSchema.parse(input);
    const db = getPool();

    const exists = await this.userExists(parsed.userId);
    if (!exists) {
      return { status: "user_not_found" };
    }

    const existing = await this.getAccountByUserId(parsed.userId);
    if (existing) {
      return { status: "already_exists", account: existing };
    }

    const now = new Date().toISOString();
    const id = `industry_account_${randomUUID()}`;
    const inserted = await db.query(
      `INSERT INTO industry_accounts (
         id,
         user_id,
         company_name,
         role_title,
         professional_email,
         website_url,
         linkedin_url,
         imdb_url,
         verification_status,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_review',$9,$10)
       RETURNING *`,
      [
        id,
        parsed.userId,
        parsed.companyName,
        parsed.roleTitle,
        parsed.professionalEmail,
        parsed.websiteUrl,
        parsed.linkedinUrl,
        parsed.imdbUrl,
        now,
        now
      ]
    );

    const defaultTeamId = `industry_team_${randomUUID()}`;
    await db.query(
      `INSERT INTO industry_teams (
         id,
         industry_account_id,
         name,
         created_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [defaultTeamId, id, "Core Team", parsed.userId, now, now]
    );
    await db.query(
      `INSERT INTO industry_team_members (
         team_id,
         user_id,
         role,
         created_at
       ) VALUES ($1,$2,'owner',$3)
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [defaultTeamId, parsed.userId, now]
    );

    return {
      status: "created",
      account: mapAccount(inserted.rows[0] as Record<string, unknown>)
    };
  }

  async getAccountById(accountId: string): Promise<IndustryAccount | null> {
    const db = getPool();
    const result = await db.query("SELECT * FROM industry_accounts WHERE id = $1", [accountId]);
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapAccount(result.rows[0] as Record<string, unknown>);
  }

  async getAccountByUserId(userId: string): Promise<IndustryAccount | null> {
    const db = getPool();
    const result = await db.query("SELECT * FROM industry_accounts WHERE user_id = $1", [userId]);
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapAccount(result.rows[0] as Record<string, unknown>);
  }

  async verifyAccount(
    accountId: string,
    reviewerUserId: string,
    input: IndustryAccountVerificationRequest
  ): Promise<IndustryAccount | null> {
    const db = getPool();
    const reviewerExists = await this.userExists(reviewerUserId);
    if (!reviewerExists) {
      return null;
    }

    const now = new Date().toISOString();
    const updateResult = await db.query(
      `UPDATE industry_accounts
          SET verification_status = $2,
              verification_notes = $3,
              verified_by_user_id = $4,
              verified_at = CASE WHEN $2 = 'verified' THEN $5::timestamptz ELSE NULL END,
              updated_at = $6
        WHERE id = $1
      RETURNING *`,
      [accountId, input.status, input.verificationNotes, reviewerUserId, now, now]
    );
    if ((updateResult.rowCount ?? 0) < 1) {
      return null;
    }

    await db.query(
      `INSERT INTO industry_vetting_reviews (
         id, account_id, reviewer_user_id, decision_status, notes, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        `industry_review_${randomUUID()}`,
        accountId,
        reviewerUserId,
        input.status,
        input.verificationNotes,
        now
      ]
    );

    return mapAccount(updateResult.rows[0] as Record<string, unknown>);
  }

  async upsertEntitlement(
    writerUserId: string,
    grantedByUserId: string,
    input: IndustryEntitlementUpsertRequest
  ): Promise<IndustryEntitlement | null> {
    const db = getPool();
    const [writerExists, granterExists] = await Promise.all([
      this.userExists(writerUserId),
      this.userExists(grantedByUserId)
    ]);
    if (!writerExists || !granterExists) {
      return null;
    }

    const account = await this.getAccountById(input.industryAccountId);
    if (!account) {
      return null;
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO industry_entitlements (
         writer_user_id,
         industry_account_id,
         access_level,
         granted_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (writer_user_id, industry_account_id)
       DO UPDATE SET
         access_level = EXCLUDED.access_level,
         granted_by_user_id = EXCLUDED.granted_by_user_id,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        writerUserId,
        input.industryAccountId,
        input.accessLevel,
        grantedByUserId,
        now,
        now
      ]
    );

    return mapEntitlement(result.rows[0] as Record<string, unknown>);
  }

  async getEntitlement(
    writerUserId: string,
    industryAccountId: string
  ): Promise<IndustryEntitlement | null> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM industry_entitlements
        WHERE writer_user_id = $1
          AND industry_account_id = $2`,
      [writerUserId, industryAccountId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return mapEntitlement(result.rows[0] as Record<string, unknown>);
  }

  async resolveScriptOwnerUserId(scriptId: string): Promise<string | null> {
    const db = getPool();
    const result = await db.query<{ owner_user_id: string }>(
      `SELECT p.owner_user_id
         FROM project_drafts pd
         JOIN projects p ON p.id = pd.project_id
        WHERE pd.script_id = $1
          AND pd.lifecycle_state = 'active'
        ORDER BY pd.updated_at DESC
        LIMIT 1`,
      [scriptId]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    return result.rows[0]?.owner_user_id ?? null;
  }

  async recordScriptDownload(input: {
    scriptId: string;
    writerUserId: string;
    industryAccountId: string;
    downloadedByUserId: string;
    source?: string;
  }): Promise<void> {
    const db = getPool();
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO industry_download_audit (
         id,
         script_id,
         writer_user_id,
         industry_account_id,
         downloaded_by_user_id,
         downloaded_at,
         source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        `industry_download_${randomUUID()}`,
        input.scriptId,
        input.writerUserId,
        input.industryAccountId,
        input.downloadedByUserId,
        now,
        input.source ?? "industry_portal"
      ]
    );
    await this.logActivity(
      input.industryAccountId,
      input.downloadedByUserId,
      "script",
      input.scriptId,
      "downloaded",
      { writerUserId: input.writerUserId }
    );
  }

  async rebuildTalentIndex(): Promise<{ indexed: number }> {
    const db = getPool();
    await db.query("TRUNCATE industry_talent_index");
    const inserted = await db.query(
      `INSERT INTO industry_talent_index (
         writer_id,
         project_id,
         display_name,
         representation_status,
         genres,
         demographics,
         project_title,
         project_format,
         project_genre,
         logline,
         synopsis,
         project_updated_at
       )
       SELECT
         wp.writer_id,
         p.id,
         wp.display_name,
         wp.representation_status,
         wp.genres,
         wp.demographics,
         p.title,
         p.format,
         p.genre,
         p.logline,
         p.synopsis,
         p.updated_at
       FROM writer_profiles wp
       JOIN projects p ON p.owner_user_id = wp.writer_id
      WHERE wp.is_searchable = TRUE
        AND p.is_discoverable = TRUE`
    );
    return { indexed: inserted.rowCount ?? 0 };
  }

  async searchTalent(filters: IndustryTalentSearchFilters): Promise<IndustryTalentSearchPage> {
    const db = getPool();
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const indexCount = await db.query<{ total: string }>("SELECT COUNT(*)::int AS total FROM industry_talent_index");
    if (Number(indexCount.rows[0]?.total ?? 0) === 0) {
      await this.rebuildTalentIndex();
    }

    const where: string[] = [];
    const params: unknown[] = [];
    let searchParamIdx: number | null = null;

    if (filters.genre) {
      params.push(filters.genre);
      where.push(`project_genre = $${params.length}`);
    }
    if (filters.format) {
      params.push(filters.format);
      where.push(`project_format = $${params.length}`);
    }
    if (filters.representationStatus) {
      params.push(filters.representationStatus);
      where.push(`representation_status = $${params.length}`);
    }
    if (filters.demographics && filters.demographics.length > 0) {
      params.push(filters.demographics);
      where.push(`demographics && $${params.length}::text[]`);
    }
    if (filters.genres && filters.genres.length > 0) {
      params.push(filters.genres);
      where.push(`genres && $${params.length}::text[]`);
    }
    if (filters.q && filters.q.trim().length > 0) {
      params.push(filters.q.trim());
      searchParamIdx = params.length;
      where.push(`search_text @@ websearch_to_tsquery('english', $${params.length})`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countResult = await db.query<{ total: string }>(
      `SELECT COUNT(*)::int AS total
         FROM industry_talent_index
       ${whereSql}`,
      params
    );

    const orderBy = searchParamIdx !== null && (filters.sort ?? "recent") === "relevance"
      ? `ORDER BY ts_rank_cd(search_text, websearch_to_tsquery('english', $${searchParamIdx})) DESC, project_updated_at DESC`
      : "ORDER BY project_updated_at DESC";

    const dataParams = [...params, limit, offset];
    const rows = await db.query(
      `SELECT *
         FROM industry_talent_index
         ${whereSql}
         ${orderBy}
         LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}`,
      dataParams
    );

    const results = rows.rows.map((row) => IndustryTalentSearchResultSchema.parse({
      writerId: row.writer_id,
      displayName: row.display_name,
      representationStatus: row.representation_status,
      genres: Array.isArray(row.genres) ? row.genres : [],
      demographics: Array.isArray(row.demographics) ? row.demographics : [],
      projectId: row.project_id,
      projectTitle: row.project_title,
      projectFormat: row.project_format,
      projectGenre: row.project_genre,
      logline: row.logline ?? "",
      synopsis: row.synopsis ?? ""
    }));

    return {
      results,
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset
    };
  }

  private roleAtLeast(role: "owner" | "editor" | "viewer", minimum: "owner" | "editor" | "viewer"): boolean {
    const order = { owner: 3, editor: 2, viewer: 1 } as const;
    return order[role] >= order[minimum];
  }

  private async userCanAccessList(
    listId: string,
    industryAccountId: string,
    userId: string,
    required: "view" | "edit"
  ): Promise<boolean> {
    const db = getPool();
    const listResult = await db.query<{
      created_by_user_id: string;
      is_shared: boolean;
    }>(
      `SELECT created_by_user_id, is_shared
         FROM industry_lists
        WHERE id = $1
          AND industry_account_id = $2
        LIMIT 1`,
      [listId, industryAccountId]
    );
    if ((listResult.rowCount ?? 0) < 1) {
      return false;
    }

    const list = listResult.rows[0];
    if (list?.created_by_user_id === userId) {
      return true;
    }

    const ownerResult = await db.query(
      `SELECT 1
         FROM industry_accounts
        WHERE id = $1
          AND user_id = $2
        LIMIT 1`,
      [industryAccountId, userId]
    );
    if ((ownerResult.rowCount ?? 0) > 0) {
      return true;
    }

    if (!list?.is_shared) {
      return false;
    }

    const permissionResult = await db.query<{ permission: "view" | "edit" }>(
      `SELECT lp.permission
         FROM industry_list_permissions lp
         JOIN industry_teams t ON t.id = lp.team_id
         JOIN industry_team_members tm ON tm.team_id = t.id
        WHERE lp.list_id = $1
          AND t.industry_account_id = $2
          AND tm.user_id = $3`,
      [listId, industryAccountId, userId]
    );
    if ((permissionResult.rowCount ?? 0) < 1) {
      return false;
    }
    if (required === "view") {
      return true;
    }
    return permissionResult.rows.some((row) => row.permission === "edit");
  }

  private async logActivity(
    industryAccountId: string,
    actorUserId: string,
    entityType: string,
    entityId: string,
    action: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const db = getPool();
    await db.query(
      `INSERT INTO industry_activity_log (
         id,
         industry_account_id,
         actor_user_id,
         entity_type,
         entity_id,
         action,
         metadata_json,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        `industry_activity_${randomUUID()}`,
        industryAccountId,
        actorUserId,
        entityType,
        entityId,
        action,
        JSON.stringify(metadata),
        new Date().toISOString()
      ]
    );
  }

  async listLists(industryAccountId: string, actorUserId: string): Promise<IndustryList[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT DISTINCT l.*
         FROM industry_lists l
         LEFT JOIN industry_list_permissions lp ON lp.list_id = l.id
         LEFT JOIN industry_teams t ON t.id = lp.team_id
         LEFT JOIN industry_team_members tm
           ON tm.team_id = t.id
          AND tm.user_id = $2
        WHERE l.industry_account_id = $1
          AND (
            l.created_by_user_id = $2
            OR EXISTS (
              SELECT 1
                FROM industry_accounts ia
               WHERE ia.id = $1
                 AND ia.user_id = $2
            )
            OR (l.is_shared = TRUE AND tm.user_id IS NOT NULL)
          )
        ORDER BY l.updated_at DESC`,
      [industryAccountId, actorUserId]
    );
    return result.rows.map((row) => mapIndustryList(row as Record<string, unknown>));
  }

  async createList(
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryListCreateRequest
  ): Promise<IndustryList | null> {
    const db = getPool();
    const [account, creatorExists, access] = await Promise.all([
      this.getAccountById(industryAccountId),
      this.userExists(createdByUserId),
      this.resolveVerifiedAccess(createdByUserId)
    ]);
    if (!account || !creatorExists || !access || access.industryAccountId !== industryAccountId) {
      return null;
    }
    if (!this.roleAtLeast(access.role, "editor")) {
      return null;
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO industry_lists (
         id,
         industry_account_id,
         name,
         description,
         created_by_user_id,
         is_shared,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        `industry_list_${randomUUID()}`,
        industryAccountId,
        input.name,
        input.description,
        createdByUserId,
        input.isShared,
        now,
        now
      ]
    );

    const list = mapIndustryList(result.rows[0] as Record<string, unknown>);
    await this.logActivity(industryAccountId, createdByUserId, "list", list.id, "created", {
      isShared: list.isShared
    });
    return list;
  }

  async addListItem(
    listId: string,
    industryAccountId: string,
    addedByUserId: string,
    input: IndustryListItemCreateRequest
  ): Promise<IndustryListItem | null> {
    const db = getPool();
    const [canEdit, writerExists, addedByExists] = await Promise.all([
      this.userCanAccessList(listId, industryAccountId, addedByUserId, "edit"),
      this.userExists(input.writerUserId),
      this.userExists(addedByUserId)
    ]);
    if (!canEdit || !writerExists || !addedByExists) {
      return null;
    }

    if (input.projectId) {
      const ownedProject = await db.query(
        `SELECT 1
           FROM projects
          WHERE id = $1
            AND owner_user_id = $2
          LIMIT 1`,
        [input.projectId, input.writerUserId]
      );
      if ((ownedProject.rowCount ?? 0) < 1) {
        return null;
      }
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO industry_list_items (
         id,
         list_id,
         writer_user_id,
         project_id,
         added_by_user_id,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (list_id, writer_user_id, project_id)
       DO UPDATE SET added_by_user_id = EXCLUDED.added_by_user_id
       RETURNING *`,
      [
        `industry_list_item_${randomUUID()}`,
        listId,
        input.writerUserId,
        input.projectId ?? null,
        addedByUserId,
        now
      ]
    );

    const item = mapListItem(result.rows[0] as Record<string, unknown>);
    await this.logActivity(industryAccountId, addedByUserId, "list_item", item.id, "upserted", {
      listId,
      writerUserId: item.writerUserId,
      projectId: item.projectId
    });
    return item;
  }

  async addListNote(
    listId: string,
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryNoteCreateRequest
  ): Promise<IndustryNote | null> {
    const db = getPool();
    const [canEdit, createdByExists] = await Promise.all([
      this.userCanAccessList(listId, industryAccountId, createdByUserId, "edit"),
      this.userExists(createdByUserId)
    ]);
    if (!canEdit || !createdByExists) {
      return null;
    }
    if (input.writerUserId && !(await this.userExists(input.writerUserId))) {
      return null;
    }
    if (input.projectId) {
      const projectExists = await db.query("SELECT 1 FROM projects WHERE id = $1 LIMIT 1", [input.projectId]);
      if ((projectExists.rowCount ?? 0) < 1) {
        return null;
      }
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO industry_notes (
         id,
         list_id,
         writer_user_id,
         project_id,
         body,
         created_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        `industry_note_${randomUUID()}`,
        listId,
        input.writerUserId ?? null,
        input.projectId ?? null,
        input.body,
        createdByUserId,
        now,
        now
      ]
    );

    const note = mapNote(result.rows[0] as Record<string, unknown>);
    await this.logActivity(industryAccountId, createdByUserId, "note", note.id, "created", {
      listId,
      writerUserId: note.writerUserId,
      projectId: note.projectId
    });
    return note;
  }

  async listTeams(industryAccountId: string): Promise<IndustryTeam[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM industry_teams
        WHERE industry_account_id = $1
        ORDER BY updated_at DESC`,
      [industryAccountId]
    );
    return result.rows.map((row) => mapTeam(row as Record<string, unknown>));
  }

  async createTeam(
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryTeamCreateRequest
  ): Promise<IndustryTeam | null> {
    const [creatorExists, access] = await Promise.all([
      this.userExists(createdByUserId),
      this.resolveVerifiedAccess(createdByUserId)
    ]);
    if (!creatorExists || !access || access.industryAccountId !== industryAccountId) {
      return null;
    }
    if (!this.roleAtLeast(access.role, "editor")) {
      return null;
    }

    const db = getPool();
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO industry_teams (
         id,
         industry_account_id,
         name,
         created_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [`industry_team_${randomUUID()}`, industryAccountId, input.name, createdByUserId, now, now]
    );
    const team = mapTeam(result.rows[0] as Record<string, unknown>);
    await db.query(
      `INSERT INTO industry_team_members (
         team_id,
         user_id,
         role,
         created_at
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (team_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [team.id, createdByUserId, access.role === "owner" ? "owner" : "editor", now]
    );
    await this.logActivity(industryAccountId, createdByUserId, "team", team.id, "created", {});
    return team;
  }

  async upsertTeamMember(
    teamId: string,
    industryAccountId: string,
    actorUserId: string,
    input: IndustryTeamMemberUpsertRequest
  ): Promise<IndustryTeamMember | null> {
    const db = getPool();
    const [actorAccess, targetUserExists] = await Promise.all([
      this.resolveVerifiedAccess(actorUserId),
      this.userExists(input.userId)
    ]);
    if (!actorAccess || actorAccess.industryAccountId !== industryAccountId || !targetUserExists) {
      return null;
    }
    if (!this.roleAtLeast(actorAccess.role, "editor")) {
      return null;
    }

    const teamResult = await db.query(
      `SELECT 1
         FROM industry_teams
        WHERE id = $1
          AND industry_account_id = $2
        LIMIT 1`,
      [teamId, industryAccountId]
    );
    if ((teamResult.rowCount ?? 0) < 1) {
      return null;
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO industry_team_members (
         team_id,
         user_id,
         role,
         created_at
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (team_id, user_id)
       DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [teamId, input.userId, input.role, now]
    );
    const member = mapTeamMember(result.rows[0] as Record<string, unknown>);
    await this.logActivity(industryAccountId, actorUserId, "team_member", `${teamId}:${input.userId}`, "upserted", {
      role: input.role
    });
    return member;
  }

  async shareListWithTeam(
    listId: string,
    industryAccountId: string,
    actorUserId: string,
    input: IndustryListShareTeamRequest
  ): Promise<boolean> {
    const db = getPool();
    const canEditList = await this.userCanAccessList(listId, industryAccountId, actorUserId, "edit");
    if (!canEditList) {
      return false;
    }

    const teamResult = await db.query(
      `SELECT 1
         FROM industry_teams
        WHERE id = $1
          AND industry_account_id = $2
        LIMIT 1`,
      [input.teamId, industryAccountId]
    );
    if ((teamResult.rowCount ?? 0) < 1) {
      return false;
    }

    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO industry_list_permissions (
         list_id,
         team_id,
         permission,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (list_id, team_id)
       DO UPDATE SET
         permission = EXCLUDED.permission,
         updated_at = EXCLUDED.updated_at`,
      [listId, input.teamId, input.permission, now, now]
    );

    await db.query(
      `UPDATE industry_lists
          SET is_shared = TRUE,
              updated_at = $2
        WHERE id = $1`,
      [listId, now]
    );
    await this.logActivity(industryAccountId, actorUserId, "list", listId, "shared_with_team", {
      teamId: input.teamId,
      permission: input.permission
    });
    return true;
  }

  async listActivity(
    industryAccountId: string,
    limit: number,
    offset: number
  ): Promise<IndustryActivityPage> {
    const db = getPool();
    const count = await db.query<{ total: string }>(
      `SELECT COUNT(*)::int AS total
         FROM industry_activity_log
        WHERE industry_account_id = $1`,
      [industryAccountId]
    );
    const rows = await db.query(
      `SELECT *
         FROM industry_activity_log
        WHERE industry_account_id = $1
        ORDER BY created_at DESC
        LIMIT $2
       OFFSET $3`,
      [industryAccountId, limit, offset]
    );
    return {
      entries: rows.rows.map((row) => mapActivity(row as Record<string, unknown>)),
      total: Number(count.rows[0]?.total ?? 0),
      limit,
      offset
    };
  }

  async listMandates(filters: IndustryMandateFilters): Promise<IndustryMandatesPage> {
    const db = getPool();
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.type) {
      params.push(filters.type);
      where.push(`type = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      where.push(`status = $${params.length}`);
    }
    if (filters.format) {
      params.push(filters.format);
      where.push(`format = $${params.length}`);
    }
    if (filters.genre) {
      params.push(filters.genre);
      where.push(`genre = $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countResult = await db.query<{ total: string }>(
      `SELECT COUNT(*)::int AS total FROM mandates ${whereSql}`,
      params
    );

    const dataParams = [...params, limit, offset];
    const rows = await db.query(
      `SELECT *
         FROM mandates
         ${whereSql}
        ORDER BY closes_at ASC
        LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      dataParams
    );

    return {
      mandates: rows.rows.map((row) => mapMandate(row as Record<string, unknown>)),
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset
    };
  }

  async createMandate(
    createdByUserId: string,
    input: IndustryMandateCreateRequest
  ): Promise<IndustryMandate | null> {
    const db = getPool();
    if (!(await this.userExists(createdByUserId))) {
      return null;
    }
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO mandates (
         id,
         type,
         title,
         description,
         format,
         genre,
         status,
         opens_at,
         closes_at,
         created_by_user_id,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        `mandate_${randomUUID()}`,
        input.type,
        input.title,
        input.description,
        input.format,
        input.genre,
        input.opensAt,
        input.closesAt,
        createdByUserId,
        now,
        now
      ]
    );
    const mandate = mapMandate(result.rows[0] as Record<string, unknown>);
    const access = await this.resolveVerifiedAccess(createdByUserId);
    if (access) {
      await this.logActivity(access.industryAccountId, createdByUserId, "mandate", mandate.id, "created", {
        type: mandate.type
      });
    }
    return mandate;
  }

  async listMandateSubmissions(mandateId: string): Promise<IndustryMandateSubmission[]> {
    const db = getPool();
    const rows = await db.query(
      `SELECT *
         FROM mandate_submissions
        WHERE mandate_id = $1
        ORDER BY created_at DESC`,
      [mandateId]
    );
    return rows.rows.map((row) => mapMandateSubmission(row as Record<string, unknown>));
  }

  async createMandateSubmission(
    mandateId: string,
    writerUserId: string,
    input: IndustryMandateSubmissionCreateRequest
  ): Promise<IndustryMandateSubmission | null> {
    const db = getPool();
    const [writerExists, projectOwned, mandateResult] = await Promise.all([
      this.userExists(writerUserId),
      db.query(
        `SELECT 1
           FROM projects
          WHERE id = $1
            AND owner_user_id = $2
          LIMIT 1`,
        [input.projectId, writerUserId]
      ),
      db.query(
        `SELECT *
           FROM mandates
          WHERE id = $1
            AND status = 'open'
            AND opens_at <= NOW()
            AND closes_at >= NOW()
          LIMIT 1`,
        [mandateId]
      )
    ]);
    if (!writerExists || (projectOwned.rowCount ?? 0) < 1 || (mandateResult.rowCount ?? 0) < 1) {
      return null;
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO mandate_submissions (
         id,
         mandate_id,
         writer_user_id,
         project_id,
         fit_explanation,
         status,
         editorial_notes,
         reviewed_by_user_id,
         reviewed_at,
         forwarded_to,
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,'submitted','',NULL,NULL,'',$6,$7)
       ON CONFLICT (mandate_id, writer_user_id, project_id)
       DO UPDATE SET
         fit_explanation = EXCLUDED.fit_explanation,
         status = 'submitted',
         editorial_notes = '',
         reviewed_by_user_id = NULL,
         reviewed_at = NULL,
         forwarded_to = '',
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        `mandate_submission_${randomUUID()}`,
        mandateId,
        writerUserId,
        input.projectId,
        input.fitExplanation,
        now,
        now
      ]
    );
    const submission = mapMandateSubmission(result.rows[0] as Record<string, unknown>);
    const mandate = mandateResult.rows[0] as Record<string, unknown> | undefined;
    const creatorUserId = typeof mandate?.created_by_user_id === "string" ? mandate.created_by_user_id : null;
    if (creatorUserId) {
      const access = await this.resolveVerifiedAccess(creatorUserId);
      if (access) {
        await this.logActivity(access.industryAccountId, writerUserId, "mandate_submission", submission.id, "submitted", {
          mandateId
        });
      }
    }
    return submission;
  }

  async reviewMandateSubmission(
    mandateId: string,
    submissionId: string,
    reviewerUserId: string,
    input: IndustryMandateSubmissionReviewRequest
  ): Promise<IndustryMandateSubmission | null> {
    const db = getPool();
    if (!(await this.userExists(reviewerUserId))) {
      return null;
    }
    const now = new Date().toISOString();
    const result = await db.query(
      `UPDATE mandate_submissions
          SET status = $4,
              editorial_notes = $5,
              reviewed_by_user_id = $6,
              reviewed_at = $7,
              forwarded_to = CASE WHEN $4 = 'forwarded' THEN $8 ELSE '' END,
              updated_at = $7
        WHERE id = $1
          AND mandate_id = $2
          AND status IN ('submitted', 'under_review')
      RETURNING *`,
      [
        submissionId,
        mandateId,
        reviewerUserId,
        input.status,
        input.editorialNotes,
        reviewerUserId,
        now,
        input.forwardedTo
      ]
    );
    if ((result.rowCount ?? 0) < 1) {
      return null;
    }
    const submission = mapMandateSubmission(result.rows[0] as Record<string, unknown>);
    const access = await this.resolveVerifiedAccess(reviewerUserId);
    if (access) {
      await this.logActivity(access.industryAccountId, reviewerUserId, "mandate_submission", submission.id, "reviewed", {
        status: input.status,
        forwardedTo: input.forwardedTo
      });
    }
    return submission;
  }

  async createWeeklyDigestRun(
    industryAccountId: string,
    generatedByUserId: string,
    input: IndustryWeeklyDigestRunRequest
  ): Promise<IndustryDigestRun | null> {
    if (!(await this.userExists(generatedByUserId))) {
      return null;
    }

    const candidatesPage = await this.searchTalent({
      limit: Math.max(input.limit * 3, 50),
      offset: 0,
      sort: "recent"
    });
    const candidateMap = new Map<string, IndustryTalentSearchResult>();
    for (const candidate of candidatesPage.results) {
      if (!candidateMap.has(candidate.writerId)) {
        candidateMap.set(candidate.writerId, candidate);
      }
    }

    const recommendations: IndustryDigestRecommendation[] = [];
    for (const overrideWriterId of input.overrideWriterIds) {
      const candidate = candidateMap.get(overrideWriterId);
      if (!candidate) {
        continue;
      }
      recommendations.push({
        writerId: candidate.writerId,
        projectId: candidate.projectId,
        reason: "Analyst override",
        source: "override"
      });
    }

    for (const candidate of candidateMap.values()) {
      if (recommendations.length >= input.limit) {
        break;
      }
      if (recommendations.some((item) => item.writerId === candidate.writerId)) {
        continue;
      }
      recommendations.push({
        writerId: candidate.writerId,
        projectId: candidate.projectId,
        reason: "Strong profile and discoverable project fit",
        source: "algorithm"
      });
    }

    const db = getPool();
    const now = new Date();
    const windowEnd = now.toISOString();
    const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await db.query(
      `INSERT INTO industry_digest_runs (
         id,
         industry_account_id,
         generated_by_user_id,
         window_start,
         window_end,
         candidate_count,
         recommendations_json,
         override_writer_ids,
         notes,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       RETURNING *`,
      [
        `industry_digest_${randomUUID()}`,
        industryAccountId,
        generatedByUserId,
        windowStart,
        windowEnd,
        candidatesPage.total,
        JSON.stringify(recommendations),
        input.overrideWriterIds,
        input.notes,
        now.toISOString()
      ]
    );

    const run = mapDigestRun(result.rows[0] as Record<string, unknown>);
    await this.logActivity(industryAccountId, generatedByUserId, "digest", run.id, "generated", {
      recommendations: run.recommendations.length,
      overrides: input.overrideWriterIds.length
    });
    return run;
  }

  async listWeeklyDigestRuns(
    industryAccountId: string,
    limit: number,
    offset: number
  ): Promise<IndustryDigestRunsPage> {
    const db = getPool();
    const count = await db.query<{ total: string }>(
      `SELECT COUNT(*)::int AS total
         FROM industry_digest_runs
        WHERE industry_account_id = $1`,
      [industryAccountId]
    );
    const rows = await db.query(
      `SELECT *
         FROM industry_digest_runs
        WHERE industry_account_id = $1
        ORDER BY created_at DESC
        LIMIT $2
       OFFSET $3`,
      [industryAccountId, limit, offset]
    );
    return {
      runs: rows.rows.map((row) => mapDigestRun(row as Record<string, unknown>)),
      total: Number(count.rows[0]?.total ?? 0),
      limit,
      offset
    };
  }

  async getAnalyticsSummary(industryAccountId: string, windowDays: number): Promise<IndustryAnalyticsSummary> {
    const db = getPool();
    const boundedDays = Number.isFinite(windowDays) ? Math.max(1, Math.min(180, Math.floor(windowDays))) : 30;
    const windowStart = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000).toISOString();

    const [
      downloadsResult,
      uniqueWritersResult,
      listsResult,
      notesResult,
      mandatesResult,
      forwardedResult,
      digestsResult
    ] = await Promise.all([
      db.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
           FROM industry_download_audit
          WHERE industry_account_id = $1
            AND downloaded_at >= $2`,
        [industryAccountId, windowStart]
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(DISTINCT writer_user_id)::int AS count
           FROM industry_download_audit
          WHERE industry_account_id = $1
            AND downloaded_at >= $2`,
        [industryAccountId, windowStart]
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
           FROM industry_lists
          WHERE industry_account_id = $1`,
        [industryAccountId]
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
           FROM industry_notes n
           JOIN industry_lists l ON l.id = n.list_id
          WHERE l.industry_account_id = $1`,
        [industryAccountId]
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
           FROM mandates m
           JOIN industry_accounts ia ON ia.user_id = m.created_by_user_id
          WHERE ia.id = $1
            AND m.status = 'open'`,
        [industryAccountId]
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
           FROM mandate_submissions ms
           JOIN mandates m ON m.id = ms.mandate_id
           JOIN industry_accounts ia ON ia.user_id = m.created_by_user_id
          WHERE ia.id = $1
            AND ms.status = 'forwarded'
            AND ms.updated_at >= $2`,
        [industryAccountId, windowStart]
      ),
      db.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
           FROM industry_digest_runs
          WHERE industry_account_id = $1
            AND created_at >= $2`,
        [industryAccountId, windowStart]
      )
    ]);

    return IndustryAnalyticsSummarySchema.parse({
      downloadsTotal: Number(downloadsResult.rows[0]?.count ?? 0),
      uniqueWritersDownloaded: Number(uniqueWritersResult.rows[0]?.count ?? 0),
      listsTotal: Number(listsResult.rows[0]?.count ?? 0),
      notesTotal: Number(notesResult.rows[0]?.count ?? 0),
      mandatesOpen: Number(mandatesResult.rows[0]?.count ?? 0),
      submissionsForwarded: Number(forwardedResult.rows[0]?.count ?? 0),
      digestsGenerated: Number(digestsResult.rows[0]?.count ?? 0)
    });
  }
}
