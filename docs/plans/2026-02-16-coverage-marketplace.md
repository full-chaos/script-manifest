# Coverage Marketplace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a paid coverage marketplace where writers purchase professional script coverage from vetted providers, with real Stripe Connect payments, escrow, and admin dispute resolution.

**Architecture:** Single new Fastify service (`coverage-marketplace-service`, port 4008) following the existing `buildServer(options)` + repository interface pattern. Stripe Connect integration behind a `PaymentGateway` interface for testability. Gateway routes at `/api/v1/coverage/*`. Frontend pages under `/coverage`.

**Tech Stack:** Fastify 5, PostgreSQL (via `@script-manifest/db`), Stripe SDK, MinIO (presigned URLs for file delivery), Zod validation, `node:test` for testing.

**Design doc:** `docs/plans/2026-02-16-coverage-marketplace-design.md`

---

## Task 1: Contracts — Coverage Marketplace Schemas

**Files:**
- Modify: `packages/contracts/src/index.ts` (append to end of file)

**Step 1: Add coverage type schemas to contracts**

Append the following to `packages/contracts/src/index.ts`:

```typescript
// ── Coverage Marketplace ───────────────────────────────────────────

export const CoverageProviderStatusSchema = z.enum([
  "pending_verification", "active", "suspended", "deactivated"
]);
export type CoverageProviderStatus = z.infer<typeof CoverageProviderStatusSchema>;

export const CoverageTierSchema = z.enum([
  "concept_notes", "early_draft", "polish_proofread", "competition_ready"
]);
export type CoverageTier = z.infer<typeof CoverageTierSchema>;

export const CoverageOrderStatusSchema = z.enum([
  "placed", "payment_held", "claimed", "in_progress", "delivered",
  "completed", "disputed", "cancelled", "payment_failed", "refunded"
]);
export type CoverageOrderStatus = z.infer<typeof CoverageOrderStatusSchema>;

export const CoverageDisputeStatusSchema = z.enum([
  "open", "under_review", "resolved_refund", "resolved_no_refund", "resolved_partial"
]);
export type CoverageDisputeStatus = z.infer<typeof CoverageDisputeStatusSchema>;

export const CoverageDisputeReasonSchema = z.enum([
  "non_delivery", "quality", "other"
]);
export type CoverageDisputeReason = z.infer<typeof CoverageDisputeReasonSchema>;

// ── Provider ───────────────────────────────────────────────────────

export const CoverageProviderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().default(""),
  specialties: z.array(z.string()).default([]),
  status: CoverageProviderStatusSchema,
  stripeAccountId: z.string().nullable(),
  stripeOnboardingComplete: z.boolean(),
  avgRating: z.number().nullable(),
  totalOrdersCompleted: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageProvider = z.infer<typeof CoverageProviderSchema>;

export const CoverageProviderCreateRequestSchema = z.object({
  displayName: z.string().min(1).max(200),
  bio: z.string().max(5000).default(""),
  specialties: z.array(z.string().min(1)).max(20).default([])
});
export type CoverageProviderCreateRequest = z.infer<typeof CoverageProviderCreateRequestSchema>;

export const CoverageProviderUpdateRequestSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  bio: z.string().max(5000).optional(),
  specialties: z.array(z.string().min(1)).max(20).optional()
});
export type CoverageProviderUpdateRequest = z.infer<typeof CoverageProviderUpdateRequestSchema>;

// ── Service ────────────────────────────────────────────────────────

export const CoverageServiceSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  tier: CoverageTierSchema,
  priceCents: z.number().int().positive(),
  currency: z.string().default("usd"),
  turnaroundDays: z.number().int().positive(),
  maxPages: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageService = z.infer<typeof CoverageServiceSchema>;

export const CoverageServiceCreateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  tier: CoverageTierSchema,
  priceCents: z.number().int().positive(),
  currency: z.string().default("usd"),
  turnaroundDays: z.number().int().min(1).max(90),
  maxPages: z.number().int().min(1).max(500)
});
export type CoverageServiceCreateRequest = z.infer<typeof CoverageServiceCreateRequestSchema>;

export const CoverageServiceUpdateRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().positive().optional(),
  turnaroundDays: z.number().int().min(1).max(90).optional(),
  maxPages: z.number().int().min(1).max(500).optional(),
  active: z.boolean().optional()
});
export type CoverageServiceUpdateRequest = z.infer<typeof CoverageServiceUpdateRequestSchema>;

// ── Order ──────────────────────────────────────────────────────────

export const CoverageOrderSchema = z.object({
  id: z.string().min(1),
  writerUserId: z.string().min(1),
  providerId: z.string().min(1),
  serviceId: z.string().min(1),
  scriptId: z.string().default(""),
  projectId: z.string().default(""),
  status: CoverageOrderStatusSchema,
  priceCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  providerPayoutCents: z.number().int().nonnegative(),
  stripePaymentIntentId: z.string().nullable(),
  stripeTransferId: z.string().nullable(),
  slaDeadline: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageOrder = z.infer<typeof CoverageOrderSchema>;

export const CoverageOrderCreateRequestSchema = z.object({
  serviceId: z.string().min(1),
  scriptId: z.string().default(""),
  projectId: z.string().default("")
});
export type CoverageOrderCreateRequest = z.infer<typeof CoverageOrderCreateRequestSchema>;

export const CoverageOrderFiltersSchema = z.object({
  status: CoverageOrderStatusSchema.optional(),
  providerId: z.string().optional(),
  writerUserId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});
export type CoverageOrderFilters = z.infer<typeof CoverageOrderFiltersSchema>;

// ── Delivery ───────────────────────────────────────────────────────

export const CoverageDeliverySchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  summary: z.string().default(""),
  strengths: z.string().default(""),
  weaknesses: z.string().default(""),
  recommendations: z.string().default(""),
  score: z.number().int().min(1).max(100).nullable(),
  fileKey: z.string().nullable(),
  fileName: z.string().nullable(),
  createdAt: z.string()
});
export type CoverageDelivery = z.infer<typeof CoverageDeliverySchema>;

export const CoverageDeliveryCreateRequestSchema = z.object({
  summary: z.string().min(1).max(10000),
  strengths: z.string().max(10000).default(""),
  weaknesses: z.string().max(10000).default(""),
  recommendations: z.string().max(10000).default(""),
  score: z.number().int().min(1).max(100).optional(),
  fileKey: z.string().optional(),
  fileName: z.string().optional()
});
export type CoverageDeliveryCreateRequest = z.infer<typeof CoverageDeliveryCreateRequestSchema>;

// ── Review ─────────────────────────────────────────────────────────

export const CoverageReviewSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  writerUserId: z.string().min(1),
  providerId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().default(""),
  createdAt: z.string()
});
export type CoverageReview = z.infer<typeof CoverageReviewSchema>;

export const CoverageReviewCreateRequestSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).default("")
});
export type CoverageReviewCreateRequest = z.infer<typeof CoverageReviewCreateRequestSchema>;

// ── Dispute ────────────────────────────────────────────────────────

export const CoverageDisputeSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  openedByUserId: z.string().min(1),
  reason: CoverageDisputeReasonSchema,
  description: z.string().default(""),
  status: CoverageDisputeStatusSchema,
  adminNotes: z.string().nullable(),
  refundAmountCents: z.number().int().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type CoverageDispute = z.infer<typeof CoverageDisputeSchema>;

export const CoverageDisputeCreateRequestSchema = z.object({
  reason: CoverageDisputeReasonSchema,
  description: z.string().min(1).max(5000)
});
export type CoverageDisputeCreateRequest = z.infer<typeof CoverageDisputeCreateRequestSchema>;

export const CoverageDisputeResolveRequestSchema = z.object({
  status: z.enum(["resolved_refund", "resolved_no_refund", "resolved_partial"]),
  adminNotes: z.string().min(1).max(5000),
  refundAmountCents: z.number().int().nonnegative().optional()
});
export type CoverageDisputeResolveRequest = z.infer<typeof CoverageDisputeResolveRequestSchema>;

// ── Browse/Filter ──────────────────────────────────────────────────

export const CoverageServiceFiltersSchema = z.object({
  tier: CoverageTierSchema.optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  maxTurnaround: z.coerce.number().int().positive().optional(),
  providerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});
export type CoverageServiceFilters = z.infer<typeof CoverageServiceFiltersSchema>;

export const CoverageProviderFiltersSchema = z.object({
  status: CoverageProviderStatusSchema.optional(),
  specialty: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});
export type CoverageProviderFilters = z.infer<typeof CoverageProviderFiltersSchema>;
```

**Step 2: Run typecheck**

Run: `pnpm --filter @script-manifest/contracts typecheck`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): add coverage marketplace schemas"
```

---

## Task 2: Database — Coverage Marketplace Tables

**Files:**
- Modify: `packages/db/src/index.ts` (append new function)

**Step 1: Add `ensureCoverageMarketplaceTables` to the DB package**

Append after the existing `ensureRankingServiceTables` function:

```typescript
export async function ensureCoverageMarketplaceTables(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      specialties TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending_verification'
        CHECK (status IN ('pending_verification', 'active', 'suspended', 'deactivated')),
      stripe_account_id TEXT,
      stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
      avg_rating NUMERIC(3,2),
      total_orders_completed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_providers_user ON coverage_providers(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_providers_status ON coverage_providers(status)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_services (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tier TEXT NOT NULL CHECK (tier IN ('concept_notes', 'early_draft', 'polish_proofread', 'competition_ready')),
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      turnaround_days INTEGER NOT NULL,
      max_pages INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_services_provider ON coverage_services(provider_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_services_active ON coverage_services(active) WHERE active = TRUE`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_orders (
      id TEXT PRIMARY KEY,
      writer_user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      service_id TEXT NOT NULL REFERENCES coverage_services(id),
      script_id TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'placed'
        CHECK (status IN ('placed', 'payment_held', 'claimed', 'in_progress', 'delivered', 'completed', 'disputed', 'cancelled', 'payment_failed', 'refunded')),
      price_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,
      provider_payout_cents INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      stripe_transfer_id TEXT,
      sla_deadline TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_orders_writer ON coverage_orders(writer_user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_orders_provider ON coverage_orders(provider_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_orders_status ON coverage_orders(status)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_deliveries (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL REFERENCES coverage_orders(id),
      summary TEXT NOT NULL DEFAULT '',
      strengths TEXT NOT NULL DEFAULT '',
      weaknesses TEXT NOT NULL DEFAULT '',
      recommendations TEXT NOT NULL DEFAULT '',
      score INTEGER CHECK (score IS NULL OR (score >= 1 AND score <= 100)),
      file_key TEXT,
      file_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_reviews (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL REFERENCES coverage_orders(id),
      writer_user_id TEXT NOT NULL,
      provider_id TEXT NOT NULL REFERENCES coverage_providers(id),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_reviews_provider ON coverage_reviews(provider_id)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coverage_disputes (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES coverage_orders(id),
      opened_by_user_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('non_delivery', 'quality', 'other')),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved_refund', 'resolved_no_refund', 'resolved_partial')),
      admin_notes TEXT,
      refund_amount_cents INTEGER,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_disputes_status ON coverage_disputes(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_coverage_disputes_order ON coverage_disputes(order_id)`);
}
```

**Step 2: Run typecheck**

Run: `pnpm --filter @script-manifest/db typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "feat(db): add coverage marketplace table schemas"
```

---

## Task 3: Service Scaffold — Package, Config, Repository Interface

**Files:**
- Create: `services/coverage-marketplace-service/package.json`
- Create: `services/coverage-marketplace-service/tsconfig.json`
- Create: `services/coverage-marketplace-service/src/repository.ts`
- Create: `services/coverage-marketplace-service/src/paymentGateway.ts`

**Step 1: Create package.json**

```json
{
  "name": "@script-manifest/coverage-marketplace-service",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "node --import tsx --test src/index.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@script-manifest/contracts": "workspace:*",
    "@script-manifest/db": "workspace:*",
    "fastify": "^5.2.0",
    "stripe": "^17.0.0",
    "undici": "^7.3.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.8.1",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create the PaymentGateway interface**

Create `services/coverage-marketplace-service/src/paymentGateway.ts`:

```typescript
export interface PaymentGateway {
  createConnectAccount(email: string): Promise<{ accountId: string; onboardingUrl: string }>;
  createAccountLink(accountId: string): Promise<{ url: string }>;
  getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }>;
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<{ intentId: string; clientSecret: string }>;
  capturePayment(intentId: string): Promise<void>;
  transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
  }): Promise<{ transferId: string }>;
  refund(intentId: string, amountCents?: number): Promise<{ refundId: string }>;
  constructWebhookEvent(payload: string, signature: string): unknown;
}

export class MemoryPaymentGateway implements PaymentGateway {
  public accounts = new Map<string, { chargesEnabled: boolean; payoutsEnabled: boolean }>();
  public intents = new Map<string, { amountCents: number; captured: boolean }>();
  public transfers: Array<{ transferId: string; amountCents: number; stripeAccountId: string }> = [];
  public refunds: Array<{ intentId: string; amountCents?: number }> = [];
  private nextId = 1;

  private id(prefix: string) {
    return `${prefix}_${String(this.nextId++)}`;
  }

  async createConnectAccount(email: string): Promise<{ accountId: string; onboardingUrl: string }> {
    const accountId = this.id("acct");
    this.accounts.set(accountId, { chargesEnabled: false, payoutsEnabled: false });
    return { accountId, onboardingUrl: `https://connect.stripe.com/setup/${accountId}` };
  }

  async createAccountLink(accountId: string): Promise<{ url: string }> {
    return { url: `https://connect.stripe.com/setup/${accountId}` };
  }

  async getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }> {
    return this.accounts.get(accountId) ?? { chargesEnabled: false, payoutsEnabled: false };
  }

  completeOnboarding(accountId: string): void {
    this.accounts.set(accountId, { chargesEnabled: true, payoutsEnabled: true });
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<{ intentId: string; clientSecret: string }> {
    const intentId = this.id("pi");
    this.intents.set(intentId, { amountCents: params.amountCents, captured: false });
    return { intentId, clientSecret: `${intentId}_secret` };
  }

  async capturePayment(intentId: string): Promise<void> {
    const intent = this.intents.get(intentId);
    if (intent) intent.captured = true;
  }

  async transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
  }): Promise<{ transferId: string }> {
    const transferId = this.id("tr");
    this.transfers.push({ transferId, amountCents: params.amountCents, stripeAccountId: params.stripeAccountId });
    return { transferId };
  }

  async refund(intentId: string, amountCents?: number): Promise<{ refundId: string }> {
    this.refunds.push({ intentId, amountCents });
    return { refundId: this.id("re") };
  }

  constructWebhookEvent(payload: string, _signature: string): unknown {
    return JSON.parse(payload);
  }
}
```

**Step 4: Create repository interface**

Create `services/coverage-marketplace-service/src/repository.ts`:

```typescript
import type {
  CoverageProvider,
  CoverageProviderCreateRequest,
  CoverageProviderUpdateRequest,
  CoverageProviderFilters,
  CoverageService,
  CoverageServiceCreateRequest,
  CoverageServiceUpdateRequest,
  CoverageServiceFilters,
  CoverageOrder,
  CoverageOrderFilters,
  CoverageDelivery,
  CoverageDeliveryCreateRequest,
  CoverageReview,
  CoverageReviewCreateRequest,
  CoverageDispute,
  CoverageDisputeCreateRequest,
  CoverageDisputeResolveRequest,
  CoverageDisputeStatus
} from "@script-manifest/contracts";

export interface CoverageMarketplaceRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  // Providers
  createProvider(userId: string, input: CoverageProviderCreateRequest): Promise<CoverageProvider>;
  getProvider(providerId: string): Promise<CoverageProvider | null>;
  getProviderByUserId(userId: string): Promise<CoverageProvider | null>;
  updateProvider(providerId: string, input: CoverageProviderUpdateRequest): Promise<CoverageProvider | null>;
  updateProviderStripe(providerId: string, stripeAccountId: string, onboardingComplete: boolean): Promise<CoverageProvider | null>;
  updateProviderStatus(providerId: string, status: string): Promise<CoverageProvider | null>;
  listProviders(filters: CoverageProviderFilters): Promise<CoverageProvider[]>;

  // Services
  createService(providerId: string, input: CoverageServiceCreateRequest): Promise<CoverageService>;
  getService(serviceId: string): Promise<CoverageService | null>;
  updateService(serviceId: string, input: CoverageServiceUpdateRequest): Promise<CoverageService | null>;
  listServicesByProvider(providerId: string): Promise<CoverageService[]>;
  listServices(filters: CoverageServiceFilters): Promise<CoverageService[]>;

  // Orders
  createOrder(params: {
    writerUserId: string;
    providerId: string;
    serviceId: string;
    scriptId: string;
    projectId: string;
    priceCents: number;
    platformFeeCents: number;
    providerPayoutCents: number;
    stripePaymentIntentId: string;
  }): Promise<CoverageOrder>;
  getOrder(orderId: string): Promise<CoverageOrder | null>;
  listOrders(filters: CoverageOrderFilters): Promise<CoverageOrder[]>;
  updateOrderStatus(orderId: string, status: string, extra?: Partial<{
    stripePaymentIntentId: string;
    stripeTransferId: string;
    slaDeadline: string;
    deliveredAt: string;
  }>): Promise<CoverageOrder | null>;

  // Deliveries
  createDelivery(orderId: string, input: CoverageDeliveryCreateRequest): Promise<CoverageDelivery>;
  getDeliveryByOrder(orderId: string): Promise<CoverageDelivery | null>;

  // Reviews
  createReview(orderId: string, writerUserId: string, providerId: string, input: CoverageReviewCreateRequest): Promise<CoverageReview>;
  getReviewByOrder(orderId: string): Promise<CoverageReview | null>;
  listReviewsByProvider(providerId: string): Promise<CoverageReview[]>;
  updateProviderRating(providerId: string): Promise<void>;

  // Disputes
  createDispute(orderId: string, userId: string, input: CoverageDisputeCreateRequest): Promise<CoverageDispute>;
  getDispute(disputeId: string): Promise<CoverageDispute | null>;
  getDisputeByOrder(orderId: string): Promise<CoverageDispute | null>;
  listDisputes(status?: CoverageDisputeStatus): Promise<CoverageDispute[]>;
  resolveDispute(disputeId: string, input: CoverageDisputeResolveRequest): Promise<CoverageDispute | null>;
}
```

**Step 5: Install deps and run typecheck**

Run: `pnpm install && pnpm --filter @script-manifest/coverage-marketplace-service typecheck`
Expected: Errors (index.ts doesn't exist yet) — that's OK, contracts and repo should parse.

**Step 6: Commit**

```bash
git add services/coverage-marketplace-service/
git commit -m "feat(coverage): scaffold service with package, repository interface, payment gateway"
```

---

## Task 4: Service — PgCoverageMarketplaceRepository

**Files:**
- Create: `services/coverage-marketplace-service/src/pgRepository.ts`

**Step 1: Implement the PG repository**

Create `services/coverage-marketplace-service/src/pgRepository.ts` implementing `CoverageMarketplaceRepository` using the `@script-manifest/db` package. Follow the exact same patterns as `services/feedback-exchange-service/src/repository.ts`:
- `getPool()` for queries
- `randomUUID()` for IDs with prefixes (`cprov_`, `csvc_`, `cord_`, `cdel_`, `crev_`, `cdis_`)
- Row types + mapper functions for snake_case → camelCase
- `init()` calls `ensureCoverageMarketplaceTables()`
- `healthCheck()` does `SELECT 1`
- Use parameterized queries for all user input
- `updateProviderRating()` recalculates avg from `coverage_reviews` and updates `coverage_providers.avg_rating`

This file is large (~400 lines). Implement all methods from the interface.

**Step 2: Run typecheck**

Run: `pnpm --filter @script-manifest/coverage-marketplace-service typecheck`
Expected: Still errors (no index.ts), but pgRepository.ts should have no type errors.

**Step 3: Commit**

```bash
git add services/coverage-marketplace-service/src/pgRepository.ts
git commit -m "feat(coverage): implement PostgreSQL repository"
```

---

## Task 5: Service — StripePaymentGateway

**Files:**
- Create: `services/coverage-marketplace-service/src/stripePaymentGateway.ts`

**Step 1: Implement the Stripe payment gateway**

```typescript
import Stripe from "stripe";
import type { PaymentGateway } from "./paymentGateway.js";

export class StripePaymentGateway implements PaymentGateway {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" });
    this.webhookSecret = webhookSecret;
  }

  async createConnectAccount(email: string): Promise<{ accountId: string; onboardingUrl: string }> {
    const account = await this.stripe.accounts.create({
      type: "express",
      email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } }
    });
    const link = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?refresh=1`,
      return_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?success=1`,
      type: "account_onboarding"
    });
    return { accountId: account.id, onboardingUrl: link.url };
  }

  async createAccountLink(accountId: string): Promise<{ url: string }> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?refresh=1`,
      return_url: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/coverage/become-provider?success=1`,
      type: "account_onboarding"
    });
    return { url: link.url };
  }

  async getAccountStatus(accountId: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false
    };
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    metadata?: Record<string, string>;
  }): Promise<{ intentId: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      capture_method: "manual",
      metadata: params.metadata ?? {}
    });
    return { intentId: intent.id, clientSecret: intent.client_secret! };
  }

  async capturePayment(intentId: string): Promise<void> {
    await this.stripe.paymentIntents.capture(intentId);
  }

  async transferToProvider(params: {
    amountCents: number;
    stripeAccountId: string;
    transferGroup?: string;
  }): Promise<{ transferId: string }> {
    const transfer = await this.stripe.transfers.create({
      amount: params.amountCents,
      currency: "usd",
      destination: params.stripeAccountId,
      transfer_group: params.transferGroup
    });
    return { transferId: transfer.id };
  }

  async refund(intentId: string, amountCents?: number): Promise<{ refundId: string }> {
    const refund = await this.stripe.refunds.create({
      payment_intent: intentId,
      ...(amountCents != null ? { amount: amountCents } : {})
    });
    return { refundId: refund.id };
  }

  constructWebhookEvent(payload: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
```

**Step 2: Run typecheck**

Run: `pnpm --filter @script-manifest/coverage-marketplace-service typecheck`
Expected: May still have issues if Stripe API version string is different. Adjust `apiVersion` to match installed Stripe SDK.

**Step 3: Commit**

```bash
git add services/coverage-marketplace-service/src/stripePaymentGateway.ts
git commit -m "feat(coverage): implement Stripe Connect payment gateway"
```

---

## Task 6: Service — Main Server (index.ts) with All Routes

**Files:**
- Create: `services/coverage-marketplace-service/src/index.ts`

**Step 1: Build the server with all route handlers**

Create `services/coverage-marketplace-service/src/index.ts` following the exact pattern from `feedback-exchange-service/src/index.ts`:

- `buildServer(options)` factory accepting `{ logger?, repository?, paymentGateway?, commissionRate? }`
- `getAuthUserId(headers)` helper (same pattern)
- `onReady` hook calling `repository.init()`
- Health routes: `/health`, `/health/live`, `/health/ready`
- All `/internal/*` routes from the design doc API surface

Key route implementations:

**Provider routes:**
- `POST /internal/providers` — create provider from auth user, then call `paymentGateway.createConnectAccount()`. Returns provider + onboarding URL.
- `GET /internal/providers/:id` — simple get
- `GET /internal/providers` — list with filters from query
- `PATCH /internal/providers/:id` — update (only if auth user matches provider.userId)
- `GET /internal/providers/:id/stripe-onboarding` — create new account link for incomplete onboarding

**Service routes:**
- `POST /internal/providers/:providerId/services` — create offering (auth must match provider)
- `GET /internal/providers/:providerId/services` — list provider offerings
- `PATCH /internal/services/:id` — update offering
- `GET /internal/services` — browse marketplace (all active services)

**Order routes:**
- `POST /internal/orders` — validate service exists, calculate fees (`price * commissionRate`), create PaymentIntent, create order in `placed` status
- `GET /internal/orders/:id` — get order (auth must be writer or provider)
- `GET /internal/orders` — list orders filtered by writerUserId or providerId
- `POST /internal/orders/:id/claim` — provider claims (status: `payment_held` → `claimed`), set SLA deadline
- `POST /internal/orders/:id/deliver` — provider delivers (creates delivery, status → `delivered`)
- `POST /internal/orders/:id/complete` — writer confirms (status → `completed`), trigger `paymentGateway.transferToProvider()`, update order with transferId, increment provider's `total_orders_completed`, recalc rating
- `POST /internal/orders/:id/cancel` — writer cancels (only if `placed` or `payment_held`), refund via PaymentGateway

**Delivery routes:**
- `GET /internal/orders/:id/delivery` — get delivery
- `GET /internal/orders/:id/delivery/upload-url` — return presigned MinIO URL (stub for now — configure later)

**Review routes:**
- `POST /internal/orders/:id/review` — writer reviews provider (only after delivered/completed)
- `GET /internal/providers/:id/reviews` — list reviews

**Dispute routes:**
- `POST /internal/orders/:id/dispute` — open dispute (status → `disputed`)
- `GET /internal/disputes` — admin list
- `PATCH /internal/disputes/:id` — admin resolve + handle refund if applicable

**Webhook route:**
- `POST /internal/stripe-webhook` — parse raw body, verify signature, handle `payment_intent.amount_capturable_updated` (→ `payment_held`), `account.updated` (→ update provider stripe status)

**startServer():**
- Use `StripePaymentGateway` if `STRIPE_SECRET_KEY` is set, otherwise `MemoryPaymentGateway`
- Commission rate from `PLATFORM_COMMISSION_RATE` env var (default 0.15)
- Port from `PORT` env var (default 4008)

**Step 2: Run typecheck**

Run: `pnpm --filter @script-manifest/coverage-marketplace-service typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add services/coverage-marketplace-service/src/index.ts
git commit -m "feat(coverage): implement service with all route handlers"
```

---

## Task 7: Service — Tests (MemoryRepository + Test Suite)

**Files:**
- Create: `services/coverage-marketplace-service/src/index.test.ts`

**Step 1: Create MemoryRepository and test suite**

Create `services/coverage-marketplace-service/src/index.test.ts` with:

1. `MemoryCoverageMarketplaceRepository` implementing `CoverageMarketplaceRepository` with in-memory Maps (same pattern as feedback-exchange test).

2. Test cases covering:
   - **Provider lifecycle**: create provider, get provider, update provider, list providers
   - **Service catalog**: create service, update service, list services, browse active services
   - **Order flow**: place order → claim → deliver → complete (happy path)
   - **Order cancellation**: place → cancel
   - **Payment fee calculation**: verify commission split
   - **Review**: create review after delivery, verify rating update
   - **Dispute flow**: open dispute, admin resolve with refund
   - **Auth checks**: verify 403 on unauthorized access
   - **Health endpoints**: verify 200 responses

Each test creates a fresh `buildServer({ logger: false, repository: memRepo, paymentGateway: memGateway })`.

**Step 2: Run tests**

Run: `pnpm --filter @script-manifest/coverage-marketplace-service test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add services/coverage-marketplace-service/src/index.test.ts
git commit -m "test(coverage): add comprehensive test suite with memory repository"
```

---

## Task 8: API Gateway Integration

**Files:**
- Modify: `services/api-gateway/src/helpers.ts` (add `coverageMarketplaceBase` to GatewayContext)
- Modify: `services/api-gateway/src/index.ts` (add import, option, context, registration)
- Create: `services/api-gateway/src/routes/coverage.ts`

**Step 1: Update GatewayContext type**

In `services/api-gateway/src/helpers.ts`, add to `GatewayContext`:

```typescript
coverageMarketplaceBase: string;
coverageAdminAllowlist: Set<string>;
```

**Step 2: Update gateway buildServer**

In `services/api-gateway/src/index.ts`:
- Add `coverageMarketplaceBase?: string` and `coverageAdminAllowlist?: string[]` to `ApiGatewayOptions`
- Add to context: `coverageMarketplaceBase: options.coverageMarketplaceBase ?? "http://localhost:4008"`
- Add to context: `coverageAdminAllowlist: new Set(options.coverageAdminAllowlist ?? parseAllowlist(process.env.COVERAGE_ADMIN_ALLOWLIST ?? "admin_01,user_admin_01"))`
- Import and register: `registerCoverageRoutes(server, ctx)`
- Add to `startServer()`: `coverageMarketplaceBase: process.env.COVERAGE_MARKETPLACE_SERVICE_URL`

**Step 3: Create coverage gateway routes**

Create `services/api-gateway/src/routes/coverage.ts`:

Map public `/api/v1/coverage/*` → internal `coverageMarketplaceBase/internal/*`:

- `POST /api/v1/coverage/providers` → auth required → `POST /internal/providers`
- `GET /api/v1/coverage/providers` → public → `GET /internal/providers`
- `GET /api/v1/coverage/providers/:id` → public → `GET /internal/providers/:id`
- `PATCH /api/v1/coverage/providers/:id` → auth required → `PATCH /internal/providers/:id`
- `GET /api/v1/coverage/providers/:id/stripe-onboarding` → auth required → `GET /internal/providers/:id/stripe-onboarding`
- `POST /api/v1/coverage/providers/:providerId/services` → auth required → same
- `GET /api/v1/coverage/providers/:providerId/services` → public → same
- `GET /api/v1/coverage/services` → public → `GET /internal/services`
- `PATCH /api/v1/coverage/services/:id` → auth required → same
- `POST /api/v1/coverage/orders` → auth required → same
- `GET /api/v1/coverage/orders` → auth required → same (pass writerUserId from auth)
- `GET /api/v1/coverage/orders/:id` → auth required → same
- `POST /api/v1/coverage/orders/:id/claim` → auth required → same
- `POST /api/v1/coverage/orders/:id/deliver` → auth required → same
- `POST /api/v1/coverage/orders/:id/complete` → auth required → same
- `POST /api/v1/coverage/orders/:id/cancel` → auth required → same
- `GET /api/v1/coverage/orders/:id/delivery` → auth required → same
- `POST /api/v1/coverage/orders/:id/review` → auth required → same
- `GET /api/v1/coverage/providers/:id/reviews` → public → same
- `POST /api/v1/coverage/orders/:id/dispute` → auth required → same
- `GET /api/v1/coverage/disputes` → admin required → same (use `resolveAdminUserId`)
- `PATCH /api/v1/coverage/disputes/:id` → admin required → same
- `POST /api/v1/coverage/stripe-webhook` → no auth (Stripe signs) → pass raw body to `/internal/stripe-webhook`

**Step 4: Run gateway typecheck and tests**

Run: `pnpm --filter @script-manifest/api-gateway typecheck && pnpm --filter @script-manifest/api-gateway test`
Expected: PASS

**Step 5: Commit**

```bash
git add services/api-gateway/src/
git commit -m "feat(gateway): add coverage marketplace route proxying"
```

---

## Task 9: Docker Compose Integration

**Files:**
- Modify: `compose.yml`

**Step 1: Add coverage-marketplace-service to compose.yml**

Add after `ranking-service` block:

```yaml
  coverage-marketplace-service:
    <<: *node-dev
    container_name: manifest-coverage-marketplace-service
    working_dir: /workspace
    volumes:
      - .:/workspace
    environment:
      PORT: "4008"
      DATABASE_URL: "postgresql://manifest:manifest@postgres:5432/manifest"
      NOTIFICATION_SERVICE_URL: "http://notification-service:4010"
      STRIPE_SECRET_KEY: ""
      STRIPE_WEBHOOK_SECRET: ""
      PLATFORM_COMMISSION_RATE: "0.15"
      COVERAGE_ADMIN_ALLOWLIST: "admin_01,user_admin_01"
      STORAGE_S3_ENDPOINT: "http://minio:9000"
      STORAGE_S3_ACCESS_KEY: "manifest"
      STORAGE_S3_SECRET_KEY: "manifest123"
      STORAGE_BUCKET: "coverage-reports"
    command: >
      sh -lc "flock /workspace/.pnpm-install.lock -c 'pnpm install --frozen-lockfile=false' && pnpm --filter @script-manifest/coverage-marketplace-service dev"
    ports:
      - "4008:4008"
    depends_on:
      postgres:
        condition: service_healthy
      notification-service:
        condition: service_started
      minio:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:4008/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s
```

**Step 2: Update api-gateway depends_on and environment**

Add to api-gateway service:
- `environment.COVERAGE_MARKETPLACE_SERVICE_URL: "http://coverage-marketplace-service:4008"`
- `depends_on.coverage-marketplace-service: condition: service_healthy`

**Step 3: Commit**

```bash
git add compose.yml
git commit -m "feat(docker): add coverage-marketplace-service to compose"
```

---

## Task 10: Frontend — API Proxy Routes

**Files:**
- Create: `apps/writer-web/app/api/v1/coverage/` directory with proxy routes

**Step 1: Create coverage API proxy routes**

Follow the same pattern as `apps/writer-web/app/api/v1/feedback/` routes. Create Next.js API route handlers that proxy to the gateway:

- `apps/writer-web/app/api/v1/coverage/providers/route.ts` — GET (list), POST (create)
- `apps/writer-web/app/api/v1/coverage/providers/[id]/route.ts` — GET, PATCH
- `apps/writer-web/app/api/v1/coverage/providers/[id]/stripe-onboarding/route.ts` — GET
- `apps/writer-web/app/api/v1/coverage/providers/[id]/services/route.ts` — GET, POST
- `apps/writer-web/app/api/v1/coverage/providers/[id]/reviews/route.ts` — GET
- `apps/writer-web/app/api/v1/coverage/services/route.ts` — GET (browse), PATCH
- `apps/writer-web/app/api/v1/coverage/services/[id]/route.ts` — PATCH
- `apps/writer-web/app/api/v1/coverage/orders/route.ts` — GET, POST
- `apps/writer-web/app/api/v1/coverage/orders/[id]/route.ts` — GET
- `apps/writer-web/app/api/v1/coverage/orders/[id]/claim/route.ts` — POST
- `apps/writer-web/app/api/v1/coverage/orders/[id]/deliver/route.ts` — POST
- `apps/writer-web/app/api/v1/coverage/orders/[id]/complete/route.ts` — POST
- `apps/writer-web/app/api/v1/coverage/orders/[id]/cancel/route.ts` — POST
- `apps/writer-web/app/api/v1/coverage/orders/[id]/delivery/route.ts` — GET
- `apps/writer-web/app/api/v1/coverage/orders/[id]/review/route.ts` — POST
- `apps/writer-web/app/api/v1/coverage/orders/[id]/dispute/route.ts` — POST
- `apps/writer-web/app/api/v1/coverage/disputes/route.ts` — GET
- `apps/writer-web/app/api/v1/coverage/disputes/[id]/route.ts` — PATCH

Check existing proxy pattern in `apps/writer-web/app/api/v1/` for exact implementation to copy.

**Step 2: Run typecheck**

Run: `pnpm --filter @script-manifest/writer-web typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/writer-web/app/api/v1/coverage/
git commit -m "feat(web): add coverage marketplace API proxy routes"
```

---

## Task 11: Frontend — Marketplace Browse Page

**Files:**
- Create: `apps/writer-web/app/coverage/page.tsx`
- Create: `apps/writer-web/app/coverage/layout.tsx`

**Step 1: Create the marketplace browse page**

Build `/coverage` page with:
- Grid of provider cards showing: display name, bio excerpt, specialties badges, average rating, starting price, number of completed orders
- Filter sidebar/bar: tier dropdown, price range, turnaround time
- Link to provider profile page on click
- Loading skeletons while fetching
- Empty state if no providers

Follow existing frontend patterns (fetch from `/api/v1/coverage/services`, use `getAuthHeaders()`, Tailwind styling consistent with existing pages).

**Step 2: Run dev server and verify**

Run: `pnpm --filter @script-manifest/writer-web dev`
Navigate to `http://localhost:3000/coverage` — verify page renders.

**Step 3: Commit**

```bash
git add apps/writer-web/app/coverage/
git commit -m "feat(web): add coverage marketplace browse page"
```

---

## Task 12: Frontend — Provider Profile Page

**Files:**
- Create: `apps/writer-web/app/coverage/providers/[id]/page.tsx`

Provider profile page showing:
- Provider info (name, bio, specialties, rating, order count)
- List of their service offerings with pricing
- "Order Coverage" button per service → links to order flow
- Reviews section from past clients
- Back link to marketplace

**Commit:** `feat(web): add provider profile page`

---

## Task 13: Frontend — Order Flow Page

**Files:**
- Create: `apps/writer-web/app/coverage/order/[serviceId]/page.tsx`

Order flow page:
- Display service details (title, description, tier, price, turnaround, max pages)
- Script selector (dropdown of user's projects/scripts)
- Price breakdown (service price, platform fee, total)
- Stripe Elements card input (using `@stripe/react-stripe-js` — add to deps)
- Place Order button → POST `/api/v1/coverage/orders`
- Success redirect to order detail page

Note: For Stripe Elements, add `@stripe/stripe-js` and `@stripe/react-stripe-js` to writer-web dependencies.

**Commit:** `feat(web): add coverage order flow with Stripe Elements`

---

## Task 14: Frontend — Order Detail Page

**Files:**
- Create: `apps/writer-web/app/coverage/orders/[id]/page.tsx`

Order detail page:
- Status timeline component showing progression through states
- Delivery content section (visible when delivered): structured fields + file download link
- Review form (visible when delivered/completed, if not yet reviewed)
- Dispute button (visible when delivered, if not yet completed)
- Cancel button (visible when placed/payment_held)
- Claim/Deliver buttons if viewer is the provider

**Commit:** `feat(web): add order detail page with status timeline`

---

## Task 15: Frontend — Provider Dashboard

**Files:**
- Create: `apps/writer-web/app/coverage/dashboard/page.tsx`

Provider dashboard:
- Tab layout: Incoming Orders | Active | Completed | Earnings
- Order cards with action buttons (Claim, Mark In Progress, Deliver)
- Earnings summary (total earned, pending payouts)
- Link to "Become a Provider" if user is not a provider
- Quick link to manage services

**Commit:** `feat(web): add provider dashboard page`

---

## Task 16: Frontend — Become a Provider Page

**Files:**
- Create: `apps/writer-web/app/coverage/become-provider/page.tsx`

Provider onboarding flow:
- Step 1: Fill out provider info (display name, bio, specialties)
- Step 2: Stripe Connect onboarding redirect
- Step 3: Return from Stripe → show success/pending status
- Step 4: Add first service offering
- If already a provider, show status and Stripe status

**Commit:** `feat(web): add provider onboarding page`

---

## Task 17: Frontend — Admin Disputes Page

**Files:**
- Create: `apps/writer-web/app/coverage/admin/disputes/page.tsx`

Admin dispute management:
- List of open/under_review disputes
- Each dispute shows: order details, writer info, provider info, reason, description
- Resolution form: status dropdown (refund/no refund/partial), admin notes, refund amount (for partial)
- Protected by admin check (compare current user ID against `ADMIN_USER_IDS` from env or a simple API check)

**Commit:** `feat(web): add admin dispute resolution page`

---

## Task 18: Navigation — Add Coverage to Header

**Files:**
- Modify: `apps/writer-web/app/components/Header.tsx` (or equivalent nav component)

**Step 1: Add "Coverage" link to main navigation**

Add a "Coverage" nav item pointing to `/coverage` in the header, alongside existing nav items (Profile, Projects, Competitions, Feedback, Rankings).

If user is a provider, also show "Provider Dashboard" or an icon.

**Step 2: Commit**

```bash
git add apps/writer-web/app/components/
git commit -m "feat(web): add coverage marketplace to navigation"
```

---

## Task 19: Final Integration — Typecheck & Test Suite

**Step 1: Run full monorepo typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 3: Fix any issues found**

**Step 4: Final commit if needed**

```bash
git commit -m "fix: resolve integration issues from coverage marketplace"
```

---

## Parallelization Notes

Tasks that can run in parallel:
- **Task 1 + Task 2**: Contracts and DB schemas are independent
- **Task 3** depends on Task 1 (imports contract types)
- **Task 4 + Task 5**: PG repo and Stripe gateway are independent (both depend on Task 3)
- **Task 6** depends on Tasks 4 + 5
- **Task 7** depends on Task 6
- **Task 8** depends on Task 6 (needs service API to proxy to)
- **Task 9**: independent (just compose.yml)
- **Task 10** depends on Task 8 (needs gateway routes defined)
- **Tasks 11-17**: Frontend pages can mostly be parallelized (all depend on Task 10 for API proxy)
- **Task 18**: independent (just nav)
- **Task 19**: depends on everything

## Dependency Graph

```
T1 (contracts) ──┐
                  ├── T3 (scaffold) ──┬── T4 (pg repo) ──┐
T2 (db tables) ──┘                    └── T5 (stripe)  ──┤
                                                          ├── T6 (server) ── T7 (tests)
T9 (docker) ──────────────────────────────────────────────┤
                                                          ├── T8 (gateway) ── T10 (proxy) ──┬── T11 (browse)
                                                          │                                  ├── T12 (provider)
                                                          │                                  ├── T13 (order flow)
                                                          │                                  ├── T14 (order detail)
                                                          │                                  ├── T15 (dashboard)
                                                          │                                  ├── T16 (onboarding)
                                                          │                                  └── T17 (disputes)
T18 (nav) ────────────────────────────────────────────────┘
T19 (integration) ── depends on ALL
```
