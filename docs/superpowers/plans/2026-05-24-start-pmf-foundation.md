# Start PMF Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Start PMF foundation across CHAOS-1794, CHAOS-1798, CHAOS-1799, and CHAOS-1800: sharpen the launch wedge, centralize privileged access policy, expand audit coverage, and make writer data portability visible.

**Architecture:** Treat CHAOS-1794 as the product/narrative foundation, then let CHAOS-1798 and CHAOS-1799 harden trust-critical backend seams before CHAOS-1800 exposes trust controls in writer-facing UX. Use shared helpers in `packages/service-utils` and gateway/BFF verification rather than per-route string checks. Keep frontend changes focused on the existing home/header/settings/profile style system.

**Tech Stack:** pnpm workspace, Next.js 16 writer web, Fastify services, TypeScript, Vitest/node:test, PostgreSQL migrations, Linear CLI.

---

## Worktree and Coordination Setup

- Work in a new isolated worktree before implementation. Do not implement in `/Users/chris/projects/script-manifest` on `main`.
- Recommended implementation worktree:
  ```bash
  git fetch origin
  git worktree add .worktrees/feat-CHAOS-1794-start-pmf-foundation -b feat/CHAOS-1794-start-pmf-foundation origin/main
  cd .worktrees/feat-CHAOS-1794-start-pmf-foundation
  pnpm install
  pnpm test
  pnpm typecheck
  ```
- Start Linear work:
  ```bash
  linear-cli i start CHAOS-1794
  linear-cli i start CHAOS-1798
  linear-cli i start CHAOS-1799
  linear-cli i start CHAOS-1800
  ```
- If baseline `pnpm test` or `pnpm typecheck` fails, stop and capture exact failing suites before changing code.

## Parallel Agent Strategy

Dispatch four agents after baseline setup. Each agent owns one issue and must follow TDD red-green-refactor for code changes.

1. **PMF/Product agent (CHAOS-1794)**: docs and launch positioning. No backend code.
2. **RBAC/security agent (CHAOS-1798)**: shared privileged auth policy and route audits. Avoid frontend copy.
3. **Audit logging agent (CHAOS-1799)**: audit event coverage and coverage matrix. Coordinate with RBAC helper names.
4. **Portability UX agent (CHAOS-1800)**: writer-visible export/deletion/portability UI and tests. Coordinate with PMF copy but avoid backend security helpers unless needed.

Integration order: CHAOS-1794 docs/copy, CHAOS-1798 helpers, CHAOS-1799 audit coverage, CHAOS-1800 UX. Run focused tests after each merge, then full `pnpm typecheck && pnpm test`.

## File Responsibility Map

### Existing files likely modified

- `Product Market Fit Review.md`: source rationale for wedge and trust priorities.
- `docs/README.md`: add PMF docs index links.
- `docs/pmf/launch-wedge.md`: new source of truth for one-sentence wedge, persona, activation path, and success metric.
- `apps/writer-web/app/page.tsx`: home page surface array and trust principles.
- `apps/writer-web/app/components/AuthBanner.tsx`: unauthenticated hero and signed-in activation path cards.
- `apps/writer-web/app/components/siteHeader.tsx`: primary nav sequencing if secondary surfaces need demotion.
- `apps/writer-web/app/settings/security/page.tsx`: existing settings/security area for writer-facing trust controls.
- `apps/writer-web/app/settings/security/page.test.tsx`: UX regression tests for export/deletion/portability visibility.
- `apps/writer-web/app/api/v1/_proxy.ts` and `apps/writer-web/app/api/v1/_proxy.test.ts`: BFF admin-role verification and forwarded-header hardening.
- `services/api-gateway/src/helpers.ts` and `services/api-gateway/src/helpers.test.ts`: gateway role/admin/service helper seams.
- `packages/service-utils/src/rbac.ts`, `packages/service-utils/src/serviceHeaders.ts`, `packages/service-utils/test/serviceHeaders.test.ts`: shared privileged policy primitives.
- `packages/db/migrations/013_admin_dashboard.sql`: existing `admin_audit_log` table reference; add new migration only if schema is insufficient.
- `services/*/src/index.ts` and route tests for privileged routes: competition, ranking, coverage marketplace, feedback disputes/moderation, notification admin, identity admin/security, industry verification, programs, partner dashboard.
- `docs/trust/audit-coverage-matrix.md`: new coverage matrix for CHAOS-1799.

### Do not change unless required

- Payment/Stripe flows except provider-review audit events.
- Ranking algorithm math except privileged edit/recompute authorization and audit logging.
- Public API contracts unless tests prove missing endpoints for CHAOS-1800.

---

## Task 1: CHAOS-1794 Launch Wedge Source of Truth

**Files:**
- Create: `docs/pmf/launch-wedge.md`
- Modify: `docs/README.md`
- Modify: `apps/writer-web/app/page.tsx`
- Modify: `apps/writer-web/app/components/AuthBanner.tsx`
- Test: `apps/writer-web/app/components/AuthBanner.test.tsx`

- [ ] **Step 1: Write failing test for unauthenticated PMF promise**

Add expectations to `apps/writer-web/app/components/AuthBanner.test.tsx`:

```tsx
it("leads unauthenticated writers with the portable career record wedge", () => {
  render(<AuthBanner writerSurfaces={writerSurfaces} trustPrinciples={trustPrinciples} />);

  expect(screen.getByRole("heading", { name: /permanent, portable screenwriting career record/i })).toBeInTheDocument();
  expect(screen.getByText(/track every script, submission, placement, coverage score, and industry download/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /start your record/i })).toHaveAttribute("href", "/signin");
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @script-manifest/writer-web test -- app/components/AuthBanner.test.tsx
```

Expected: FAIL because the current hero says “Build your screenwriting portfolio without losing your history again.”

- [ ] **Step 3: Add PMF document**

Create `docs/pmf/launch-wedge.md`:

```markdown
# Launch Wedge: Portable Career Record

## One-sentence promise

Script Manifest is the permanent, portable screenwriting career record for writers who need proof of their scripts, submissions, placements, coverage, and industry activity to survive any platform change.

## Primary persona

The launch persona is an actively submitting screenwriter with multiple scripts and scattered competition history who needs one trusted place to track progress, prove momentum, and share a career profile.

## Primary use case

A writer creates a profile, adds projects, records submissions and placements, uploads scripts, then shares or exports a portable career record.

## Activation path

1. Create profile.
2. Add first project.
3. Add first submission or placement.
4. Upload or attach a script draft.
5. Share the writer profile or export the career record.

## Success metric

Primary: weekly retained writers who add or update at least one profile, project, submission, placement, script, share link, or export event.

Secondary: share/export rate for writer profiles and career records.

## Launch emphasis

Lead with profile, projects, submissions, placements, script hosting, competition intelligence, shareability, and export.

De-emphasize peer feedback, paid coverage, advanced ranking, programs, partner dashboards, and industry discovery until trust and liquidity are credible.
```

- [ ] **Step 4: Update docs index**

Add under `## Core Planning` in `docs/README.md`:

```markdown
- PMF launch wedge: `docs/pmf/launch-wedge.md`
```

- [ ] **Step 5: Update home page data**

In `apps/writer-web/app/page.tsx`, adjust writer surfaces to match activation order and add a trust principle for visible portability:

```tsx
const writerSurfaces: Surface[] = [
  {
    title: "Profile",
    description: "Create the public home for your screenwriting career record.",
    href: "/profile" as Route,
    iconKey: "profile"
  },
  {
    title: "Projects",
    description: "Add scripts, drafts, and collaborators before tracking outcomes.",
    href: "/projects" as Route,
    iconKey: "projects"
  },
  {
    title: "Submissions",
    description: "Record submissions and placements so your progress is never trapped elsewhere.",
    href: "/submissions" as Route,
    iconKey: "submissions"
  },
  {
    title: "Competitions",
    description: "Find upcoming deadlines that fit each project’s format, genre, and fee range.",
    href: "/competitions" as Route,
    iconKey: "competitions"
  }
];

const trustPrinciples = [
  "CSV, PDF, and script exports are first-class, not hidden settings.",
  "Deletion requests and portability status stay visible to writers.",
  "No script leaves your control without explicit permission.",
  "Every major ranking or recommendation decision is documented."
];
```

- [ ] **Step 6: Update AuthBanner hero copy**

In `apps/writer-web/app/components/AuthBanner.tsx`, change the unauthenticated hero to:

```tsx
<p className="eyebrow">Permanent Career Record</p>
<h1 className="max-w-4xl font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
  Your permanent, portable screenwriting career record.
</h1>
<p className="max-w-3xl text-base text-foreground-secondary md:text-lg">
  Track every script, submission, placement, coverage score, and industry download in one writer-owned profile you can share or export anytime.
</p>
<div className="inline-form">
  <Link href="/signin" className="btn btn-primary no-underline">
    Start your record
  </Link>
  <Link href="/competitions" className="btn btn-secondary no-underline">
    Browse competitions
  </Link>
</div>
```

- [ ] **Step 7: Verify GREEN**

Run:

```bash
pnpm --filter @script-manifest/writer-web test -- app/components/AuthBanner.test.tsx
pnpm --filter @script-manifest/writer-web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add docs/pmf/launch-wedge.md docs/README.md apps/writer-web/app/page.tsx apps/writer-web/app/components/AuthBanner.tsx apps/writer-web/app/components/AuthBanner.test.tsx
git commit -m "docs: define PMF launch wedge"
```

---

## Task 2: CHAOS-1798 Centralized Privileged Policy

**Files:**
- Modify: `packages/service-utils/src/rbac.ts`
- Modify: `packages/service-utils/src/serviceHeaders.ts`
- Modify: `packages/service-utils/src/index.ts`
- Test: `packages/service-utils/test/serviceHeaders.test.ts`
- Modify: `services/api-gateway/src/helpers.ts`
- Test: `services/api-gateway/src/helpers.test.ts`
- Modify/test service routes that currently trust only `x-admin-user-id`.

- [ ] **Step 1: Write failing shared-helper tests**

In `packages/service-utils/test/serviceHeaders.test.ts`, add tests for named privileged policy helpers:

```ts
it("requirePrivilegedActor accepts only admin service tokens for admin actions", () => {
  process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
  const adminToken = signServiceToken({ sub: "admin_01", role: "admin" }, TEST_SECRET);
  const writerToken = signServiceToken({ sub: "writer_01", role: "writer" }, TEST_SECRET);

  assert.deepEqual(requirePrivilegedActor({ "x-service-token": adminToken }, "admin"), {
    userId: "admin_01",
    role: "admin"
  });
  assert.equal(requirePrivilegedActor({ "x-service-token": writerToken }, "admin"), null);
});

it("requirePrivilegedActor prefers verified x-auth-user-id over token subject", () => {
  process.env.SERVICE_TOKEN_SECRET = TEST_SECRET;
  const token = signServiceToken({ sub: "svc_admin", role: "admin" }, TEST_SECRET);

  assert.deepEqual(
    requirePrivilegedActor({ "x-service-token": token, "x-auth-user-id": "admin_42" }, "admin"),
    { userId: "admin_42", role: "admin" }
  );
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @script-manifest/service-utils test -- serviceHeaders.test.ts
```

Expected: FAIL because `requirePrivilegedActor` does not exist.

- [ ] **Step 3: Implement shared helper minimally**

In `packages/service-utils/src/serviceHeaders.ts`:

```ts
export type PrivilegedActor = {
  userId: string;
  role: Role;
};

export function requirePrivilegedActor(
  headers: Record<string, unknown>,
  requiredRole: Role
): PrivilegedActor | null {
  const payload = verifyInternalToken(headers);
  if (!payload) return null;
  if (payload.role !== requiredRole && payload.role !== "admin") return null;
  const userId = headers["x-auth-user-id"];
  return {
    userId: typeof userId === "string" && userId.length > 0 ? userId : payload.sub,
    role: payload.role
  };
}

export function requireAdminServiceToken(headers: Record<string, unknown>): string | null {
  return requirePrivilegedActor(headers, "admin")?.userId ?? null;
}
```

Export it from `packages/service-utils/src/index.ts`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @script-manifest/service-utils test -- serviceHeaders.test.ts
pnpm --filter @script-manifest/service-utils typecheck
```

Expected: PASS.

- [ ] **Step 5: Write failing service-route tests for header-only weaknesses**

For each service that accepts privileged actions via only `x-admin-user-id`, add or update route tests to reject requests without a valid service token:

- `services/competition-directory-service/src/index.test.ts`: admin curation routes.
- `services/ranking-service/src/index.test.ts`: prestige edits, recompute, flags, appeals.
- `services/feedback-exchange-service/src/index.test.ts`: dispute/appeal moderation.
- `services/coverage-marketplace-service/src/index.test.ts`: provider review and coverage dispute resolution.
- `services/industry-portal-service/src/index.test.ts`: industry account verification/admin review.
- `services/programs-service/src/index.test.ts`: program moderation/admin workflows.

Representative test:

```ts
test("admin route rejects forwarded admin header without service token", async (t) => {
  const server = buildServer({ repository });
  t.after(() => server.close());

  const response = await server.inject({
    method: "POST",
    url: "/internal/admin/example",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { action: "approve" }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "admin_required");
});
```

- [ ] **Step 6: Verify RED for each touched service**

Run each touched service test command, for example:

```bash
pnpm --filter @script-manifest/competition-directory-service test -- index.test.ts
pnpm --filter @script-manifest/ranking-service test -- index.test.ts
pnpm --filter @script-manifest/coverage-marketplace-service test -- index.test.ts
```

Expected: FAIL where routes still trust `x-admin-user-id` without `x-service-token`.

- [ ] **Step 7: Replace header-only route checks with shared helper**

In each privileged service route, import `requirePrivilegedActor` or continue `requireAdminServiceToken` after updating its internals. Pattern:

```ts
const actor = requirePrivilegedActor(req.headers as Record<string, unknown>, "admin");
if (!actor) {
  return reply.status(403).send({ error: "admin_required" });
}
const adminUserId = actor.userId;
```

Do not accept browser-forwarded `x-admin-user-id` unless it is paired with a valid internal service token generated by the gateway/BFF chain.

- [ ] **Step 8: Verify service GREEN**

Run focused service tests touched in Step 5. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/service-utils services apps/writer-web/app/api/v1/_proxy.ts apps/writer-web/app/api/v1/_proxy.test.ts
git commit -m "fix: centralize privileged access policy"
```

---

## Task 3: CHAOS-1799 Audit Logging Coverage

**Files:**
- Create: `packages/service-utils/src/auditEvents.ts`
- Modify: `packages/service-utils/src/index.ts`
- Test: `packages/service-utils/test/auditEvents.test.ts`
- Modify: relevant service route/repository files.
- Create: `docs/trust/audit-coverage-matrix.md`

- [ ] **Step 1: Write failing audit event taxonomy test**

Create `packages/service-utils/test/auditEvents.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { PRIVILEGED_AUDIT_ACTIONS } from "../src/auditEvents.js";

test("privileged audit taxonomy covers PMF trust actions", () => {
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("provider.review"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("coverage.dispute.resolve"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("ranking.prestige.update"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("ranking.recompute"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("ranking.flag.resolve"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("competition.moderate"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("notification.admin.send"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("feature_flag.update"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("user.suspend"));
  assert.ok(PRIVILEGED_AUDIT_ACTIONS.includes("security.ip_block.update"));
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @script-manifest/service-utils test -- auditEvents.test.ts
```

Expected: FAIL because `auditEvents.ts` does not exist.

- [ ] **Step 3: Add audit taxonomy**

Create `packages/service-utils/src/auditEvents.ts`:

```ts
export const PRIVILEGED_AUDIT_ACTIONS = [
  "provider.review",
  "coverage.dispute.resolve",
  "feedback.dispute.resolve",
  "ranking.prestige.update",
  "ranking.recompute",
  "ranking.flag.resolve",
  "ranking.appeal.resolve",
  "competition.moderate",
  "notification.admin.send",
  "feature_flag.create",
  "feature_flag.update",
  "feature_flag.delete",
  "user.suspend",
  "security.ip_block.update"
] as const;

export type PrivilegedAuditAction = (typeof PRIVILEGED_AUDIT_ACTIONS)[number];
```

Export it from `packages/service-utils/src/index.ts`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm --filter @script-manifest/service-utils test -- auditEvents.test.ts
pnpm --filter @script-manifest/service-utils typecheck
```

Expected: PASS.

- [ ] **Step 5: Write failing route-level audit tests**

For each privileged route group, add assertions that successful privileged mutations call the existing repository audit insertion or create an audit event row in `admin_audit_log`:

- Provider review: `provider.review`.
- Coverage dispute resolution: `coverage.dispute.resolve`.
- Feedback dispute resolution: `feedback.dispute.resolve`.
- Ranking prestige update/recompute/flag/appeal: matching `ranking.*` actions.
- Competition moderation/visibility/access/cancel: `competition.moderate`.
- Notification broadcast/direct/template changes: `notification.admin.send` or template-specific action if already present.
- Feature flag create/update/delete: `feature_flag.*`.
- User suspension/IP block: `user.suspend`, `security.ip_block.update`.

Representative in-memory repository assertion:

```ts
assert.deepEqual(repository.auditEvents.at(-1), {
  adminUserId: "admin_01",
  action: "ranking.prestige.update",
  targetType: "competition",
  targetId: "competition_01"
});
```

- [ ] **Step 6: Verify RED per service**

Run focused tests for each route group. Expected: FAIL for missing audit event writes.

- [ ] **Step 7: Implement minimal audit writes**

Use existing `admin_audit_log` schema where available. If a service does not own a repository method yet, add a focused repository method with this shape:

```ts
type AuditEventInput = {
  adminUserId: string;
  action: PrivilegedAuditAction;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
};
```

Insert after the privileged mutation succeeds. Do not log failed authorization attempts in this task unless an existing audit pattern already does.

- [ ] **Step 8: Add coverage matrix doc**

Create `docs/trust/audit-coverage-matrix.md`:

```markdown
# Privileged Audit Coverage Matrix

| Area | Action | Route group | Audit action | Test file |
|---|---|---|---|---|
| Provider review | approve/reject provider | coverage marketplace | `provider.review` | `services/coverage-marketplace-service/src/index.test.ts` |
| Coverage disputes | resolve dispute | coverage marketplace | `coverage.dispute.resolve` | `services/coverage-marketplace-service/src/index.test.ts` |
| Feedback disputes | resolve review dispute | feedback exchange | `feedback.dispute.resolve` | `services/feedback-exchange-service/src/index.test.ts` |
| Ranking prestige | edit competition prestige | ranking | `ranking.prestige.update` | `services/ranking-service/src/index.test.ts` |
| Ranking recompute | trigger recompute | ranking | `ranking.recompute` | `services/ranking-service/src/index.test.ts` |
| Ranking flags | resolve suspicious activity | ranking | `ranking.flag.resolve` | `services/ranking-service/src/index.test.ts` |
| Ranking appeals | resolve appeal | ranking | `ranking.appeal.resolve` | `services/ranking-service/src/index.test.ts` |
| Competition moderation | visibility/access/cancel | competition directory | `competition.moderate` | `services/competition-directory-service/src/index.test.ts` |
| Admin notifications | broadcast/direct/template | notification service | `notification.admin.send` | `services/notification-service/src/admin-routes.test.ts` |
| Feature flags | create/update/delete | identity/admin | `feature_flag.*` | `services/identity-service/src/*feature*test.ts` |
| User suspension | suspend/reactivate user | identity/admin | `user.suspend` | `services/identity-service/src/*user*test.ts` |
| IP blocks | create/delete IP block | identity/admin | `security.ip_block.update` | `services/identity-service/src/ip-block-routes.test.ts` |
```

- [ ] **Step 9: Verify GREEN**

Run all focused tests from the matrix and:

```bash
pnpm --filter @script-manifest/service-utils test
pnpm --filter @script-manifest/service-utils typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/service-utils services docs/trust/audit-coverage-matrix.md
git commit -m "feat: expand privileged audit coverage"
```

---

## Task 4: CHAOS-1800 Writer-visible Export, Deletion, and Portability UX

**Files:**
- Modify: `apps/writer-web/app/settings/security/page.tsx`
- Test: `apps/writer-web/app/settings/security/page.test.tsx`
- Create or modify: `apps/writer-web/app/api/v1/account/export/route.ts`
- Create or modify: `apps/writer-web/app/api/v1/account/deletion-request/route.ts`
- Test: matching route tests.
- Modify: `docs/phase-0/data-portability-policy.md`

- [ ] **Step 1: Write failing settings UX test**

In `apps/writer-web/app/settings/security/page.test.tsx`, add:

```tsx
it("shows writer-visible data portability controls without monetization", async () => {
  render(<SecuritySettingsPage />);

  expect(await screen.findByRole("heading", { name: /data portability/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export pdf/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export scripts/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /request deletion/i })).toBeInTheDocument();
  expect(screen.getByText(/basic trust controls are included for every writer/i)).toBeInTheDocument();
  expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @script-manifest/writer-web test -- app/settings/security/page.test.tsx
```

Expected: FAIL because the portability panel/actions are absent.

- [ ] **Step 3: Add API route proxy tests**

Create route tests that assert:

- `GET /api/v1/account/export?format=csv` proxies to gateway.
- `GET /api/v1/account/export?format=pdf` proxies to gateway.
- `GET /api/v1/account/export?format=scripts` proxies to gateway.
- `POST /api/v1/account/deletion-request` proxies to gateway.

Representative assertion:

```ts
expect(vi.mocked(proxyRequest)).toHaveBeenCalledWith(request, "/api/v1/account/export");
```

- [ ] **Step 4: Verify route RED**

Run:

```bash
pnpm --filter @script-manifest/writer-web test -- app/api/v1/account
```

Expected: FAIL because routes do not exist.

- [ ] **Step 5: Implement minimal BFF routes**

Create `apps/writer-web/app/api/v1/account/export/route.ts`:

```ts
import { proxyRequest } from "../../_proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyRequest(request, "/api/v1/account/export");
}
```

Create `apps/writer-web/app/api/v1/account/deletion-request/route.ts`:

```ts
import { proxyRequest } from "../../_proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return proxyRequest(request, "/api/v1/account/deletion-request");
}

export async function POST(request: Request) {
  return proxyRequest(request, "/api/v1/account/deletion-request");
}
```

- [ ] **Step 6: Add settings panel**

In `apps/writer-web/app/settings/security/page.tsx`, add a “Data portability” card matching existing `hero-card`/`panel` conventions:

```tsx
<section className="panel space-y-4" aria-labelledby="data-portability-title">
  <div>
    <p className="eyebrow">Portability Guarantee</p>
    <h2 id="data-portability-title" className="section-title">Data portability</h2>
    <p className="text-sm text-foreground-secondary">
      Basic trust controls are included for every writer. Export your profile, projects, submissions, placements, coverage records, and scripts without upgrading.
    </p>
  </div>
  <div className="flex flex-wrap gap-2">
    <button type="button" className="btn btn-secondary" onClick={() => void exportAccount("csv")}>Export CSV</button>
    <button type="button" className="btn btn-secondary" onClick={() => void exportAccount("pdf")}>Export PDF</button>
    <button type="button" className="btn btn-secondary" onClick={() => void exportAccount("scripts")}>Export scripts</button>
    <button type="button" className="btn btn-danger" onClick={() => void requestDeletion()}>Request deletion</button>
  </div>
</section>
```

Implement `exportAccount(format)` and `requestDeletion()` with existing fetch/toast patterns in that file. Keep behavior minimal: call the BFF endpoint, surface success/error text, and render deletion status if `GET /api/v1/account/deletion-request` returns one.

- [ ] **Step 7: Update portability policy**

In `docs/phase-0/data-portability-policy.md`, add:

```markdown
## Writer-visible controls

The writer web app exposes CSV export, PDF export, script export, deletion request, and deletion status controls from security/account settings. These controls are basic trust guarantees and must not be paywalled.
```

- [ ] **Step 8: Verify GREEN**

Run:

```bash
pnpm --filter @script-manifest/writer-web test -- app/settings/security/page.test.tsx
pnpm --filter @script-manifest/writer-web test -- app/api/v1/account
pnpm --filter @script-manifest/writer-web typecheck
```

Expected: PASS.

- [ ] **Step 9: Manual QA**

Run:

```bash
pnpm --filter @script-manifest/writer-web dev
```

Open `/settings/security` in a browser. Verify:

1. Data portability card is visible.
2. CSV/PDF/scripts export controls are visible.
3. Deletion request/status copy is visible.
4. No premium/upgrade/paywall language appears.
5. Buttons surface a useful error if the gateway is unavailable.

- [ ] **Step 10: Commit**

```bash
git add apps/writer-web/app/settings/security apps/writer-web/app/api/v1/account docs/phase-0/data-portability-policy.md
git commit -m "feat: expose writer data portability controls"
```

---

## Integration Verification

- [ ] **Step 1: Run changed package tests**

```bash
pnpm --filter @script-manifest/service-utils test
pnpm --filter @script-manifest/writer-web test
pnpm --filter @script-manifest/api-gateway test
```

Expected: PASS.

- [ ] **Step 2: Run full typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: PASS or only documented pre-existing baseline failures.

- [ ] **Step 4: Run build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Manual QA through surfaces**

Use browser QA for:

- `/`: hero says “permanent, portable screenwriting career record.”
- `/`: activation cards show Profile → Projects → Submissions → Competitions.
- `/settings/security`: export/deletion controls are visible to signed-in writers.
- Admin route smoke test: browser-supplied `x-admin-user-id` alone cannot perform admin actions.
- Successful privileged mutation with a valid service token writes an audit event visible through `/admin/audit-log` or repository test output.

## Final Linear and PR Steps

- [ ] Update Linear issues with implementation notes:

```bash
linear-cli i update CHAOS-1794 -s Done
linear-cli i update CHAOS-1798 -s Done
linear-cli i update CHAOS-1799 -s Done
linear-cli i update CHAOS-1800 -s Done
```

- [ ] Push branch explicitly, never with bare `git push` from a worktree tracking `main`:

```bash
git push origin HEAD:feat/CHAOS-1794-start-pmf-foundation
```

- [ ] Create PR:

```bash
gh pr create --head feat/CHAOS-1794-start-pmf-foundation --base main --title "Start PMF foundation" --body "Implements CHAOS-1794, CHAOS-1798, CHAOS-1799, CHAOS-1800."
```

## Self-review Checklist

- CHAOS-1794 covered by Task 1.
- CHAOS-1798 covered by Task 2.
- CHAOS-1799 covered by Task 3.
- CHAOS-1800 covered by Task 4.
- TDD red-green steps are explicit for all code changes.
- Parallel agent ownership is defined and avoids overlapping files where possible.
- Manual QA covers user-visible PMF and portability surfaces plus security/audit behavior.
