#!/usr/bin/env tsx
import { getPool, closePool } from "../packages/db/src/index.js";

type UserRow = { id: string; email: string; display_name: string; created_at: Date };

type PoolLike = {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
};

export type ManageAdminDeps = {
  getPool: () => PoolLike;
  closePool: () => Promise<void>;
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => never;
};

const defaultDeps: ManageAdminDeps = {
  getPool,
  closePool,
  log: console.log,
  error: console.error,
  exit: (code: number) => process.exit(code)
};

async function promote(email: string, deps: ManageAdminDeps): Promise<void> {
  const pool = deps.getPool();
  const result = await pool.query(
    "UPDATE app_users SET role = 'admin' WHERE email = $1 RETURNING id, email, display_name",
    [email]
  );
  if (result.rows.length === 0) {
    deps.error(`User not found: ${email}`);
    deps.exit(1);
  }
  const user = result.rows[0] as UserRow;
  deps.log(`Promoted ${user.display_name} <${user.email}> [${user.id}] to admin`);
}

async function demote(email: string, deps: ManageAdminDeps): Promise<void> {
  const pool = deps.getPool();
  const result = await pool.query(
    "UPDATE app_users SET role = 'writer' WHERE email = $1 AND role = 'admin' RETURNING id, email, display_name",
    [email]
  );
  if (result.rows.length === 0) {
    deps.error(`Admin user not found: ${email}`);
    deps.exit(1);
  }
  const user = result.rows[0] as UserRow;
  deps.log(`Demoted ${user.display_name} <${user.email}> [${user.id}] to writer`);
}

async function list(deps: ManageAdminDeps): Promise<void> {
  const pool = deps.getPool();
  const result = await pool.query(
    "SELECT id, email, display_name, created_at FROM app_users WHERE role = 'admin' ORDER BY created_at"
  );
  if (result.rows.length === 0) {
    deps.log("No admin users found.");
    return;
  }
  deps.log(`\nAdmin users (${result.rows.length}):\n`);
  for (const row of result.rows as UserRow[]) {
    const since = new Date(row.created_at).toLocaleDateString();
    deps.log(`  ${row.display_name} <${row.email}> [${row.id}] — since ${since}`);
  }
  deps.log("");
}

export async function runManageAdmin(args: string[], deps: ManageAdminDeps = defaultDeps): Promise<void> {
  const [command, arg] = args;

  switch (command) {
    case "promote":
      if (!arg) {
        deps.error("Usage: manage-admin promote <email>");
        deps.exit(1);
      }
      await promote(arg, deps);
      break;
    case "demote":
      if (!arg) {
        deps.error("Usage: manage-admin demote <email>");
        deps.exit(1);
      }
      await demote(arg, deps);
      break;
    case "list":
      await list(deps);
      break;
    default:
      deps.error("Usage: manage-admin <promote|demote|list> [email]");
      deps.exit(1);
  }
  await deps.closePool();
}

const isMain =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("/scripts/manage-admin.ts") ||
    process.argv[1].endsWith("\\scripts\\manage-admin.ts") ||
    process.argv[1].endsWith("manage-admin.ts"));

if (isMain) {
  runManageAdmin(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
