#!/usr/bin/env tsx
import { getPool, closePool } from "../packages/db/src/index.js";

type UserRow = { id: string; email: string; display_name: string; created_at: Date };

const [command, arg] = process.argv.slice(2);

async function promote(email: string): Promise<void> {
  const pool = getPool();
  const result = await pool.query<UserRow>(
    "UPDATE app_users SET role = 'admin' WHERE email = $1 RETURNING id, email, display_name",
    [email]
  );
  if (result.rows.length === 0) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }
  const user = result.rows[0]!;
  console.log(`Promoted ${user.display_name} <${user.email}> [${user.id}] to admin`);
}

async function demote(email: string): Promise<void> {
  const pool = getPool();
  const result = await pool.query<UserRow>(
    "UPDATE app_users SET role = 'writer' WHERE email = $1 AND role = 'admin' RETURNING id, email, display_name",
    [email]
  );
  if (result.rows.length === 0) {
    console.error(`Admin user not found: ${email}`);
    process.exit(1);
  }
  const user = result.rows[0]!;
  console.log(`Demoted ${user.display_name} <${user.email}> [${user.id}] to writer`);
}

async function list(): Promise<void> {
  const pool = getPool();
  const result = await pool.query<UserRow>(
    "SELECT id, email, display_name, created_at FROM app_users WHERE role = 'admin' ORDER BY created_at"
  );
  if (result.rows.length === 0) {
    console.log("No admin users found.");
    return;
  }
  console.log(`\nAdmin users (${result.rows.length}):\n`);
  for (const row of result.rows) {
    const since = new Date(row.created_at).toLocaleDateString();
    console.log(`  ${row.display_name} <${row.email}> [${row.id}] — since ${since}`);
  }
  console.log();
}

async function main(): Promise<void> {
  switch (command) {
    case "promote":
      if (!arg) { console.error("Usage: manage-admin promote <email>"); process.exit(1); }
      await promote(arg);
      break;
    case "demote":
      if (!arg) { console.error("Usage: manage-admin demote <email>"); process.exit(1); }
      await demote(arg);
      break;
    case "list":
      await list();
      break;
    default:
      console.error("Usage: manage-admin <promote|demote|list> [email]");
      process.exit(1);
  }
  await closePool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
