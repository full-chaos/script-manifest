import { randomUUID } from "node:crypto";
import { getPool } from "@script-manifest/db";
import type {
  AdminUser,
  AdminUserDetail,
  AuditLogEntry,
  ContentReport,
  ModerationActionType
} from "@script-manifest/contracts";

// ── Types ────────────────────────────────────────────────────────

export type ListUsersParams = {
  search?: string;
  role?: string;
  status?: string;
  page: number;
  limit: number;
};

export type ListAuditLogParams = {
  adminUserId?: string;
  action?: string;
  targetType?: string;
  page: number;
  limit: number;
};

export type ListReportsParams = {
  status?: string;
  contentType?: string;
  page: number;
  limit: number;
};

export type AuditLogInput = {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
};

// ── Interface ────────────────────────────────────────────────────

export interface AdminRepository {
  init(): Promise<void>;

  // User management
  listUsers(params: ListUsersParams): Promise<{ users: AdminUser[]; total: number }>;
  getUserById(id: string): Promise<AdminUserDetail | null>;
  updateUserStatus(id: string, status: string): Promise<boolean>;
  updateUserRole(id: string, role: string): Promise<boolean>;

  // Audit log
  createAuditLogEntry(input: AuditLogInput): Promise<AuditLogEntry>;
  listAuditLogEntries(params: ListAuditLogParams): Promise<{ entries: AuditLogEntry[]; total: number }>;

  // Content moderation
  createContentReport(reporterId: string, contentType: string, contentId: string, reason: string, description?: string): Promise<ContentReport>;
  listContentReports(params: ListReportsParams): Promise<{ reports: ContentReport[]; total: number }>;
  getContentReportById(id: string): Promise<ContentReport | null>;
  resolveContentReport(id: string, adminUserId: string, resolution: string, status: string): Promise<ContentReport | null>;
  createModerationAction(adminUserId: string, targetUserId: string, actionType: ModerationActionType, reason: string, reportId?: string): Promise<void>;

  // Metrics
  getUserMetrics(): Promise<{ totalUsers: number; activeUsers30d: number; pendingReports: number }>;
}

// ── In-Memory Implementation (for tests) ─────────────────────────

export class MemoryAdminRepository implements AdminRepository {
  private users: AdminUser[] = [];
  private auditLog: AuditLogEntry[] = [];
  private reports: ContentReport[] = [];
  private counter = 0;

  private nextId(prefix: string): string {
    return `${prefix}_${++this.counter}`;
  }

  async init(): Promise<void> { /* no-op */ }

  async listUsers(params: ListUsersParams): Promise<{ users: AdminUser[]; total: number }> {
    let filtered = [...this.users];
    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter((u) => u.email.toLowerCase().includes(s) || u.displayName.toLowerCase().includes(s));
    }
    if (params.role) filtered = filtered.filter((u) => u.role === params.role);
    if (params.status) filtered = filtered.filter((u) => u.accountStatus === params.status);
    const offset = (params.page - 1) * params.limit;
    return { users: filtered.slice(offset, offset + params.limit), total: filtered.length };
  }

  async getUserById(id: string): Promise<AdminUserDetail | null> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;
    return { ...user, sessionCount: 0, reportCount: 0 };
  }

  async updateUserStatus(id: string, status: string): Promise<boolean> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return false;
    (user as { accountStatus: string }).accountStatus = status;
    return true;
  }

  async updateUserRole(id: string, role: string): Promise<boolean> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return false;
    (user as { role: string }).role = role;
    return true;
  }

  async createAuditLogEntry(input: AuditLogInput): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: this.nextId("audit"),
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
      createdAt: new Date().toISOString()
    };
    this.auditLog.push(entry);
    return entry;
  }

  async listAuditLogEntries(params: ListAuditLogParams): Promise<{ entries: AuditLogEntry[]; total: number }> {
    let filtered = [...this.auditLog];
    if (params.adminUserId) filtered = filtered.filter((e) => e.adminUserId === params.adminUserId);
    if (params.action) filtered = filtered.filter((e) => e.action === params.action);
    if (params.targetType) filtered = filtered.filter((e) => e.targetType === params.targetType);
    const offset = (params.page - 1) * params.limit;
    return { entries: filtered.slice(offset, offset + params.limit), total: filtered.length };
  }

  async createContentReport(reporterId: string, contentType: string, contentId: string, reason: string, description?: string): Promise<ContentReport> {
    const now = new Date().toISOString();
    const report: ContentReport = {
      id: this.nextId("rpt"),
      reporterId,
      contentType: contentType as ContentReport["contentType"],
      contentId,
      reason: reason as ContentReport["reason"],
      description: description ?? null,
      status: "pending",
      resolvedByUserId: null,
      resolution: null,
      createdAt: now,
      updatedAt: now
    };
    this.reports.push(report);
    return report;
  }

  async listContentReports(params: ListReportsParams): Promise<{ reports: ContentReport[]; total: number }> {
    let filtered = [...this.reports];
    if (params.status) filtered = filtered.filter((r) => r.status === params.status);
    if (params.contentType) filtered = filtered.filter((r) => r.contentType === params.contentType);
    const offset = (params.page - 1) * params.limit;
    return { reports: filtered.slice(offset, offset + params.limit), total: filtered.length };
  }

  async getContentReportById(id: string): Promise<ContentReport | null> {
    return this.reports.find((r) => r.id === id) ?? null;
  }

  async resolveContentReport(id: string, adminUserId: string, resolution: string, status: string): Promise<ContentReport | null> {
    const report = this.reports.find((r) => r.id === id);
    if (!report) return null;
    (report as { status: string }).status = status;
    (report as { resolvedByUserId: string }).resolvedByUserId = adminUserId;
    (report as { resolution: string }).resolution = resolution;
    (report as { updatedAt: string }).updatedAt = new Date().toISOString();
    return report;
  }

  async createModerationAction(): Promise<void> { /* stored in memory is not needed for tests */ }

  async getUserMetrics(): Promise<{ totalUsers: number; activeUsers30d: number; pendingReports: number }> {
    return {
      totalUsers: this.users.length,
      activeUsers30d: this.users.length,
      pendingReports: this.reports.filter((r) => r.status === "pending").length
    };
  }
}

// ── PostgreSQL Implementation ────────────────────────────────────

export class PgAdminRepository implements AdminRepository {
  async init(): Promise<void> {
    const db = getPool();
    // Ensure admin tables exist (migration 013)
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details JSONB,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS content_reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        resolved_by_user_id TEXT,
        resolution TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status);`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS moderation_actions (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        content_ref TEXT,
        report_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  // ── User Management ──────────────────────────────────────────

  async listUsers(params: ListUsersParams): Promise<{ users: AdminUser[]; total: number }> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.search) {
      conditions.push(`(u.email ILIKE $${paramIndex} OR u.display_name ILIKE $${paramIndex})`);
      values.push(`%${params.search}%`);
      paramIndex++;
    }
    if (params.role) {
      conditions.push(`u.role = $${paramIndex}`);
      values.push(params.role);
      paramIndex++;
    }
    if (params.status) {
      conditions.push(`u.account_status = $${paramIndex}`);
      values.push(params.status);
      paramIndex++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (params.page - 1) * params.limit;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM app_users u ${where}`,
      values
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const result = await db.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      account_status: string;
      email_verified: boolean;
      created_at: Date;
    }>(
      `SELECT u.id, u.email, u.display_name, u.role, u.account_status, u.email_verified, u.created_at
       FROM app_users u ${where}
       ORDER BY u.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, params.limit, offset]
    );

    return {
      users: result.rows.map(mapUserRow),
      total
    };
  }

  async getUserById(id: string): Promise<AdminUserDetail | null> {
    const db = getPool();
    const result = await db.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      account_status: string;
      email_verified: boolean;
      created_at: Date;
    }>(
      `SELECT id, email, display_name, role, account_status, email_verified, created_at
       FROM app_users WHERE id = $1`,
      [id]
    );

    const row = result.rows[0];
    if (!row) return null;

    const sessionResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM app_sessions WHERE user_id = $1 AND expires_at > NOW()`,
      [id]
    );
    const reportResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM content_reports WHERE reporter_id = $1`,
      [id]
    );

    return {
      ...mapUserRow(row),
      sessionCount: Number(sessionResult.rows[0]?.count ?? 0),
      reportCount: Number(reportResult.rows[0]?.count ?? 0)
    };
  }

  async updateUserStatus(id: string, status: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ id: string }>(
      `UPDATE app_users SET account_status = $2 WHERE id = $1 RETURNING id`,
      [id, status]
    );
    return result.rows.length > 0;
  }

  async updateUserRole(id: string, role: string): Promise<boolean> {
    const db = getPool();
    const result = await db.query<{ id: string }>(
      `UPDATE app_users SET role = $2 WHERE id = $1 RETURNING id`,
      [id, role]
    );
    return result.rows.length > 0;
  }

  // ── Audit Log ────────────────────────────────────────────────

  async createAuditLogEntry(input: AuditLogInput): Promise<AuditLogEntry> {
    const db = getPool();
    const id = `audit_${randomUUID()}`;
    const result = await db.query<{
      id: string;
      admin_user_id: string;
      action: string;
      target_type: string;
      target_id: string;
      details: Record<string, unknown> | null;
      ip_address: string | null;
      created_at: Date;
    }>(
      `INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, admin_user_id, action, target_type, target_id, details, ip_address, created_at`,
      [id, input.adminUserId, input.action, input.targetType, input.targetId, input.details ? JSON.stringify(input.details) : null, input.ipAddress ?? null]
    );

    const row = result.rows[0]!;
    return mapAuditRow(row);
  }

  async listAuditLogEntries(params: ListAuditLogParams): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.adminUserId) {
      conditions.push(`admin_user_id = $${paramIndex}`);
      values.push(params.adminUserId);
      paramIndex++;
    }
    if (params.action) {
      conditions.push(`action = $${paramIndex}`);
      values.push(params.action);
      paramIndex++;
    }
    if (params.targetType) {
      conditions.push(`target_type = $${paramIndex}`);
      values.push(params.targetType);
      paramIndex++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (params.page - 1) * params.limit;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM admin_audit_log ${where}`,
      values
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const result = await db.query<{
      id: string;
      admin_user_id: string;
      action: string;
      target_type: string;
      target_id: string;
      details: Record<string, unknown> | null;
      ip_address: string | null;
      created_at: Date;
    }>(
      `SELECT id, admin_user_id, action, target_type, target_id, details, ip_address, created_at
       FROM admin_audit_log ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, params.limit, offset]
    );

    return {
      entries: result.rows.map(mapAuditRow),
      total
    };
  }

  // ── Content Moderation ───────────────────────────────────────

  async createContentReport(
    reporterId: string,
    contentType: string,
    contentId: string,
    reason: string,
    description?: string
  ): Promise<ContentReport> {
    const db = getPool();
    const id = `rpt_${randomUUID()}`;
    const result = await db.query<ReportRow>(
      `INSERT INTO content_reports (id, reporter_id, content_type, content_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, reporterId, contentType, contentId, reason, description ?? null]
    );

    return mapReportRow(result.rows[0]!);
  }

  async listContentReports(params: ListReportsParams): Promise<{ reports: ContentReport[]; total: number }> {
    const db = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(params.status);
      paramIndex++;
    }
    if (params.contentType) {
      conditions.push(`content_type = $${paramIndex}`);
      values.push(params.contentType);
      paramIndex++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (params.page - 1) * params.limit;

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM content_reports ${where}`,
      values
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const result = await db.query<ReportRow>(
      `SELECT * FROM content_reports ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, params.limit, offset]
    );

    return {
      reports: result.rows.map(mapReportRow),
      total
    };
  }

  async getContentReportById(id: string): Promise<ContentReport | null> {
    const db = getPool();
    const result = await db.query<ReportRow>(
      `SELECT * FROM content_reports WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapReportRow(row) : null;
  }

  async resolveContentReport(id: string, adminUserId: string, resolution: string, status: string): Promise<ContentReport | null> {
    const db = getPool();
    const result = await db.query<ReportRow>(
      `UPDATE content_reports SET status = $2, resolved_by_user_id = $3, resolution = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, adminUserId, resolution]
    );
    const row = result.rows[0];
    return row ? mapReportRow(row) : null;
  }

  async createModerationAction(
    adminUserId: string,
    targetUserId: string,
    actionType: ModerationActionType,
    reason: string,
    reportId?: string
  ): Promise<void> {
    const db = getPool();
    const id = `mod_${randomUUID()}`;
    await db.query(
      `INSERT INTO moderation_actions (id, admin_user_id, target_user_id, action_type, reason, report_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, adminUserId, targetUserId, actionType, reason, reportId ?? null]
    );
  }

  // ── Metrics ──────────────────────────────────────────────────

  async getUserMetrics(): Promise<{ totalUsers: number; activeUsers30d: number; pendingReports: number }> {
    const db = getPool();
    const [totalResult, activeResult, reportsResult] = await Promise.all([
      db.query<{ count: string }>(`SELECT COUNT(*) as count FROM app_users WHERE account_status != 'deleted'`),
      db.query<{ count: string }>(`SELECT COUNT(*) as count FROM app_users WHERE created_at > NOW() - INTERVAL '30 days' AND account_status != 'deleted'`),
      db.query<{ count: string }>(`SELECT COUNT(*) as count FROM content_reports WHERE status = 'pending'`)
    ]);

    return {
      totalUsers: Number(totalResult.rows[0]?.count ?? 0),
      activeUsers30d: Number(activeResult.rows[0]?.count ?? 0),
      pendingReports: Number(reportsResult.rows[0]?.count ?? 0)
    };
  }
}

// ── Row Mappers ──────────────────────────────────────────────────

type ReportRow = {
  id: string;
  reporter_id: string;
  content_type: string;
  content_id: string;
  reason: string;
  description: string | null;
  status: string;
  resolved_by_user_id: string | null;
  resolution: string | null;
  created_at: Date;
  updated_at: Date;
};

function toISOString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

function mapUserRow(row: {
  id: string;
  email: string;
  display_name: string;
  role: string;
  account_status: string;
  email_verified: boolean;
  created_at: Date;
}): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    accountStatus: row.account_status as AdminUser["accountStatus"],
    emailVerified: row.email_verified,
    createdAt: toISOString(row.created_at)
  };
}

function mapAuditRow(row: {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: Date;
}): AuditLogEntry {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details,
    ipAddress: row.ip_address,
    createdAt: toISOString(row.created_at)
  };
}

function mapReportRow(row: ReportRow): ContentReport {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    contentType: row.content_type as ContentReport["contentType"],
    contentId: row.content_id,
    reason: row.reason as ContentReport["reason"],
    description: row.description,
    status: row.status as ContentReport["status"],
    resolvedByUserId: row.resolved_by_user_id,
    resolution: row.resolution,
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at)
  };
}
