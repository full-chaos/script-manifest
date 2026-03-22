import { randomUUID } from "node:crypto";
import { getPool } from "@script-manifest/db";
import type {
  NotificationTemplate,
  NotificationTemplateStatus,
  NotificationBroadcast,
  BroadcastStatus,
  CreateNotificationTemplateRequest,
  SendBroadcastRequest
} from "@script-manifest/contracts";

// ── Interface ──────────────────────────────────────────────────────

export interface NotificationAdminRepository {
  init(): Promise<void>;
  createTemplate(input: CreateNotificationTemplateRequest & { createdBy: string }): Promise<NotificationTemplate>;
  listTemplates(): Promise<NotificationTemplate[]>;
  getTemplateById(id: string): Promise<NotificationTemplate | null>;
  updateTemplateStatus(id: string, status: NotificationTemplateStatus): Promise<boolean>;
  createBroadcast(input: SendBroadcastRequest & { sentBy: string }): Promise<NotificationBroadcast>;
  listBroadcasts(params: { status?: BroadcastStatus; page: number; limit: number }): Promise<{ broadcasts: NotificationBroadcast[]; total: number }>;
  updateBroadcastStatus(id: string, status: BroadcastStatus, recipientCount?: number): Promise<boolean>;
  getUserIdsByAudience(audience: string): Promise<string[]>;
}

// ── Helpers ────────────────────────────────────────────────────────

function toISOString(val: unknown): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

// ── Memory Implementation (Tests) ─────────────────────────────────

export class MemoryNotificationAdminRepository implements NotificationAdminRepository {
  private templates: NotificationTemplate[] = [];
  private broadcasts: NotificationBroadcast[] = [];
  private users: Array<{ id: string; role: string }> = [];

  constructor(users?: Array<{ id: string; role: string }>) {
    if (users) this.users = users;
  }

  async getUserIdsByAudience(audience: string): Promise<string[]> {
    if (audience.startsWith("user:")) {
      return [audience.slice("user:".length)];
    }
    if (audience.startsWith("role:")) {
      const role = audience.slice("role:".length);
      return this.users.filter((u) => u.role === role).map((u) => u.id);
    }
    return this.users.map((u) => u.id);
  }

  async init(): Promise<void> {
    return Promise.resolve();
  }

  async createTemplate(input: CreateNotificationTemplateRequest & { createdBy: string }): Promise<NotificationTemplate> {
    const now = new Date().toISOString();
    const template: NotificationTemplate = {
      id: randomUUID(),
      name: input.name,
      subject: input.subject,
      bodyTemplate: input.bodyTemplate,
      category: input.category,
      createdBy: input.createdBy,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    this.templates.push(template);
    return template;
  }

  async listTemplates(): Promise<NotificationTemplate[]> {
    return [...this.templates];
  }

  async getTemplateById(id: string): Promise<NotificationTemplate | null> {
    return this.templates.find((t) => t.id === id) ?? null;
  }

  async updateTemplateStatus(id: string, status: NotificationTemplateStatus): Promise<boolean> {
    const template = this.templates.find((t) => t.id === id);
    if (!template) return false;
    template.status = status;
    template.updatedAt = new Date().toISOString();
    return true;
  }

  async createBroadcast(input: SendBroadcastRequest & { sentBy: string }): Promise<NotificationBroadcast> {
    const now = new Date().toISOString();
    const broadcast: NotificationBroadcast = {
      id: randomUUID(),
      templateId: input.templateId ?? null,
      subject: input.subject,
      body: input.body,
      audience: input.audience,
      sentBy: input.sentBy,
      recipientCount: 0,
      status: "pending",
      sentAt: null,
      createdAt: now
    };
    this.broadcasts.push(broadcast);
    return broadcast;
  }

  async listBroadcasts(params: { status?: BroadcastStatus; page: number; limit: number }): Promise<{ broadcasts: NotificationBroadcast[]; total: number }> {
    let filtered = [...this.broadcasts];
    if (params.status) {
      filtered = filtered.filter((b) => b.status === params.status);
    }
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = filtered.length;
    const offset = (params.page - 1) * params.limit;
    const broadcasts = filtered.slice(offset, offset + params.limit);
    return { broadcasts, total };
  }

  async updateBroadcastStatus(id: string, status: BroadcastStatus, recipientCount?: number): Promise<boolean> {
    const broadcast = this.broadcasts.find((b) => b.id === id);
    if (!broadcast) return false;
    broadcast.status = status;
    if (recipientCount !== undefined) {
      broadcast.recipientCount = recipientCount;
    }
    if (status === "sent") {
      broadcast.sentAt = new Date().toISOString();
    }
    return true;
  }
}

// ── PostgreSQL Implementation ─────────────────────────────────────

type TemplateRow = {
  id: string;
  name: string;
  subject: string;
  body_template: string;
  category: string;
  created_by: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type BroadcastRow = {
  id: string;
  template_id: string | null;
  subject: string;
  body: string;
  audience: string;
  sent_by: string;
  recipient_count: number;
  status: string;
  sent_at: Date | null;
  created_at: Date;
};

function mapTemplate(row: TemplateRow): NotificationTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    bodyTemplate: row.body_template,
    category: row.category as NotificationTemplate["category"],
    createdBy: row.created_by,
    status: row.status as NotificationTemplate["status"],
    createdAt: toISOString(row.created_at),
    updatedAt: toISOString(row.updated_at)
  };
}

function mapBroadcast(row: BroadcastRow): NotificationBroadcast {
  return {
    id: row.id,
    templateId: row.template_id,
    subject: row.subject,
    body: row.body,
    audience: row.audience,
    sentBy: row.sent_by,
    recipientCount: row.recipient_count,
    status: row.status as NotificationBroadcast["status"],
    sentAt: row.sent_at ? toISOString(row.sent_at) : null,
    createdAt: toISOString(row.created_at)
  };
}

export class PgNotificationAdminRepository implements NotificationAdminRepository {
  async init(): Promise<void> {
    // Tables are managed by migration 015
  }

  async getUserIdsByAudience(audience: string): Promise<string[]> {
    if (audience.startsWith("user:")) {
      return [audience.slice("user:".length)];
    }
    if (audience.startsWith("role:")) {
      const role = audience.slice("role:".length);
      const result = await getPool().query<{ id: string }>(
        `SELECT id FROM app_users WHERE role = $1`,
        [role]
      );
      return result.rows.map((r) => r.id);
    }
    // "all" — return every user
    const result = await getPool().query<{ id: string }>(`SELECT id FROM app_users`);
    return result.rows.map((r) => r.id);
  }

  async createTemplate(input: CreateNotificationTemplateRequest & { createdBy: string }): Promise<NotificationTemplate> {
    const id = randomUUID();
    const result = await getPool().query<TemplateRow>(
      `INSERT INTO notification_templates (id, name, subject, body_template, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.name, input.subject, input.bodyTemplate, input.category, input.createdBy]
    );
    return mapTemplate(result.rows[0]!);
  }

  async listTemplates(): Promise<NotificationTemplate[]> {
    const result = await getPool().query<TemplateRow>(
      `SELECT * FROM notification_templates ORDER BY created_at DESC`
    );
    return result.rows.map(mapTemplate);
  }

  async getTemplateById(id: string): Promise<NotificationTemplate | null> {
    const result = await getPool().query<TemplateRow>(
      `SELECT * FROM notification_templates WHERE id = $1`,
      [id]
    );
    return result.rows.length > 0 ? mapTemplate(result.rows[0]!) : null;
  }

  async updateTemplateStatus(id: string, status: NotificationTemplateStatus): Promise<boolean> {
    const result = await getPool().query(
      `UPDATE notification_templates SET status = $2, updated_at = NOW() WHERE id = $1`,
      [id, status]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createBroadcast(input: SendBroadcastRequest & { sentBy: string }): Promise<NotificationBroadcast> {
    const id = randomUUID();
    const result = await getPool().query<BroadcastRow>(
      `INSERT INTO notification_broadcasts (id, template_id, subject, body, audience, sent_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.templateId ?? null, input.subject, input.body, input.audience, input.sentBy]
    );
    return mapBroadcast(result.rows[0]!);
  }

  async listBroadcasts(params: { status?: BroadcastStatus; page: number; limit: number }): Promise<{ broadcasts: NotificationBroadcast[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(params.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await getPool().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notification_broadcasts ${where}`,
      values
    );
    const total = Number(countResult.rows[0]!.count);

    const offset = (params.page - 1) * params.limit;
    const limitParam = paramIndex++;
    const offsetParam = paramIndex++;
    const dataResult = await getPool().query<BroadcastRow>(
      `SELECT * FROM notification_broadcasts ${where} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...values, params.limit, offset]
    );

    return { broadcasts: dataResult.rows.map(mapBroadcast), total };
  }

  async updateBroadcastStatus(id: string, status: BroadcastStatus, recipientCount?: number): Promise<boolean> {
    let query: string;
    let values: unknown[];

    if (recipientCount !== undefined && status === "sent") {
      query = `UPDATE notification_broadcasts SET status = $2, recipient_count = $3, sent_at = NOW() WHERE id = $1`;
      values = [id, status, recipientCount];
    } else if (status === "sent") {
      query = `UPDATE notification_broadcasts SET status = $2, sent_at = NOW() WHERE id = $1`;
      values = [id, status];
    } else if (recipientCount !== undefined) {
      query = `UPDATE notification_broadcasts SET status = $2, recipient_count = $3 WHERE id = $1`;
      values = [id, status, recipientCount];
    } else {
      query = `UPDATE notification_broadcasts SET status = $2 WHERE id = $1`;
      values = [id, status];
    }

    const result = await getPool().query(query, values);
    return (result.rowCount ?? 0) > 0;
  }
}
