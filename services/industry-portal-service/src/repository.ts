import { randomUUID } from "node:crypto";
import {
  type IndustryAccount,
  IndustryAccountCreateInternalSchema,
  type IndustryAccountCreateInternal,
  type IndustryAccountVerificationRequest,
  IndustryAccountSchema,
  type IndustryEntitlement,
  type IndustryEntitlementUpsertRequest,
  IndustryEntitlementSchema,
  type IndustryList,
  type IndustryListCreateRequest,
  type IndustryListItem,
  type IndustryListItemCreateRequest,
  IndustryListItemSchema,
  IndustryListSchema,
  type IndustryMandate,
  type IndustryMandateCreateRequest,
  type IndustryMandateFilters,
  type IndustryMandateSubmission,
  type IndustryMandateSubmissionCreateRequest,
  IndustryMandateSchema,
  IndustryMandateSubmissionSchema,
  type IndustryNote,
  type IndustryNoteCreateRequest,
  IndustryNoteSchema,
  type IndustryTalentSearchFilters,
  type IndustryTalentSearchResult,
  IndustryTalentSearchResultSchema
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

export interface IndustryPortalRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;
  userExists(userId: string): Promise<boolean>;
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
  searchTalent(filters: IndustryTalentSearchFilters): Promise<IndustryTalentSearchPage>;
  listLists(industryAccountId: string): Promise<IndustryList[]>;
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
  listMandates(filters: IndustryMandateFilters): Promise<IndustryMandatesPage>;
  createMandate(
    createdByUserId: string,
    input: IndustryMandateCreateRequest
  ): Promise<IndustryMandate | null>;
  createMandateSubmission(
    mandateId: string,
    writerUserId: string,
    input: IndustryMandateSubmissionCreateRequest
  ): Promise<IndustryMandateSubmission | null>;
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
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
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

  async searchTalent(filters: IndustryTalentSearchFilters): Promise<IndustryTalentSearchPage> {
    const db = getPool();
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    const where: string[] = [
      "wp.is_searchable = TRUE",
      "p.is_discoverable = TRUE"
    ];
    const params: unknown[] = [];

    if (filters.genre) {
      params.push(filters.genre);
      where.push(`p.genre = $${params.length}`);
    }
    if (filters.format) {
      params.push(filters.format);
      where.push(`p.format = $${params.length}`);
    }
    if (filters.representationStatus) {
      params.push(filters.representationStatus);
      where.push(`wp.representation_status = $${params.length}`);
    }
    if (filters.q && filters.q.trim().length > 0) {
      params.push(`%${filters.q.trim()}%`);
      where.push(`(
        wp.display_name ILIKE $${params.length}
        OR p.title ILIKE $${params.length}
        OR p.logline ILIKE $${params.length}
        OR p.synopsis ILIKE $${params.length}
      )`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const countResult = await db.query<{ total: string }>(
      `SELECT COUNT(*)::int AS total
         FROM writer_profiles wp
         JOIN projects p ON p.owner_user_id = wp.writer_id
       ${whereSql}`,
      params
    );

    const dataParams = [...params, limit, offset];
    const rows = await db.query(
      `SELECT
         wp.writer_id,
         wp.display_name,
         wp.representation_status,
         wp.genres,
         wp.demographics,
         p.id AS project_id,
         p.title AS project_title,
         p.format AS project_format,
         p.genre AS project_genre,
         p.logline,
         p.synopsis
       FROM writer_profiles wp
       JOIN projects p ON p.owner_user_id = wp.writer_id
       ${whereSql}
       ORDER BY p.updated_at DESC
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

  async listLists(industryAccountId: string): Promise<IndustryList[]> {
    const db = getPool();
    const result = await db.query(
      `SELECT *
         FROM industry_lists
        WHERE industry_account_id = $1
        ORDER BY updated_at DESC`,
      [industryAccountId]
    );
    return result.rows.map((row) => mapIndustryList(row as Record<string, unknown>));
  }

  async createList(
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryListCreateRequest
  ): Promise<IndustryList | null> {
    const db = getPool();
    const [account, creatorExists] = await Promise.all([
      this.getAccountById(industryAccountId),
      this.userExists(createdByUserId)
    ]);
    if (!account || !creatorExists) {
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

    return mapIndustryList(result.rows[0] as Record<string, unknown>);
  }

  private async listBelongsToAccount(listId: string, industryAccountId: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query(
      `SELECT 1
         FROM industry_lists
        WHERE id = $1
          AND industry_account_id = $2
        LIMIT 1`,
      [listId, industryAccountId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async addListItem(
    listId: string,
    industryAccountId: string,
    addedByUserId: string,
    input: IndustryListItemCreateRequest
  ): Promise<IndustryListItem | null> {
    const db = getPool();
    const [listOk, writerExists, addedByExists] = await Promise.all([
      this.listBelongsToAccount(listId, industryAccountId),
      this.userExists(input.writerUserId),
      this.userExists(addedByUserId)
    ]);
    if (!listOk || !writerExists || !addedByExists) {
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

    return mapListItem(result.rows[0] as Record<string, unknown>);
  }

  async addListNote(
    listId: string,
    industryAccountId: string,
    createdByUserId: string,
    input: IndustryNoteCreateRequest
  ): Promise<IndustryNote | null> {
    const db = getPool();
    const [listOk, createdByExists] = await Promise.all([
      this.listBelongsToAccount(listId, industryAccountId),
      this.userExists(createdByUserId)
    ]);
    if (!listOk || !createdByExists) {
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

    return mapNote(result.rows[0] as Record<string, unknown>);
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

    return mapMandate(result.rows[0] as Record<string, unknown>);
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
         created_at,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,'submitted',$6,$7)
       ON CONFLICT (mandate_id, writer_user_id, project_id)
       DO UPDATE SET
         fit_explanation = EXCLUDED.fit_explanation,
         status = 'submitted',
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

    return mapMandateSubmission(result.rows[0] as Record<string, unknown>);
  }
}
