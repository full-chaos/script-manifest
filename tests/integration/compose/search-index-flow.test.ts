import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { getPool } from "../../../packages/db/src/index.js";
import { API_BASE_URL, authHeaders, expectOkJson, jsonRequest, loginUser, makeUnique } from "./helpers.js";

type CompetitionEntry = {
  id: string;
  title?: string;
};

const ADMIN_USER_ID = "admin_01";
const ADMIN_EMAIL = "admin_01_harness@example.com";
const ADMIN_PASSWORD = "AdminPass1!";

const db = getPool(process.env.INTEGRATION_DATABASE_URL ?? "postgresql://manifest:manifest@localhost:5432/manifest");

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
}

async function ensureAdminUser(): Promise<string> {
  const salt = "harness_admin_salt_01";
  const hash = hashPassword(ADMIN_PASSWORD, salt);
  await db.query(
    `INSERT INTO app_users (id, email, password_hash, password_salt, display_name, role, created_at, terms_accepted_at)
     VALUES ($1,$2,$3,$4,'Integration Admin','admin',NOW(),NOW())
     ON CONFLICT (id)
     DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
                   password_salt = EXCLUDED.password_salt, role = EXCLUDED.role`,
    [ADMIN_USER_ID, ADMIN_EMAIL, hash, salt]
  );
  const session = await loginUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  return session.token;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("compose flow: create competition then query competitions search for indexed result", async () => {
  const adminToken = await ensureAdminUser();
  const uniqueTitle = makeUnique("search_index_competition");
  const competitionId = makeUnique("competition_search_flow");

  await expectOkJson<{ competition: { id: string; title: string } }>(`${API_BASE_URL}/api/v1/admin/competitions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(adminToken)
    },
    body: JSON.stringify({
      id: competitionId,
      title: uniqueTitle,
      description: "Competition used for compose search integration flow.",
      format: "feature",
      genre: "drama",
      feeUsd: 25,
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    })
  }, 201);

  let found = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await jsonRequest<{ competitions: CompetitionEntry[] }>(
      `${API_BASE_URL}/api/v1/competitions?q=${encodeURIComponent(uniqueTitle)}`,
      { method: "GET" }
    );

    if (search.status === 200) {
      found = search.body.competitions.some((entry) => {
        return entry.id === competitionId || entry.title === uniqueTitle;
      });
      if (found) {
        break;
      }
    }

    await wait(500);
  }

  assert.equal(found, true, "expected competitions results to include newly created competition");
});
