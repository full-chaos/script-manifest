import { randomUUID } from "node:crypto";
import {
  type IndustryAccount,
  IndustryAccountCreateInternalSchema,
  type IndustryAccountCreateInternal,
  type IndustryAccountVerificationRequest,
  IndustryAccountSchema,
  type IndustryEntitlement,
  type IndustryEntitlementUpsertRequest,
  IndustryEntitlementSchema
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
}
