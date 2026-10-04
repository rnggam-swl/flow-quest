/**
 * Backs up every table in the database's public schema:
 *
 *   npx tsx --env-file=.env prisma/backup-db.ts
 *
 * Writes backups/<timestamp>/ (git-ignored — it holds users' password hashes and answers):
 *   - <Table>.json    one array of rows per table, exactly as Postgres returns them
 *   - data.sql        INSERTs for every row, ordered parents-before-children by foreign key
 *   - schema.prisma   the schema the data was taken under
 *   - manifest.json   row count per table
 *
 * To restore into an empty database: `npx prisma db push` with that schema.prisma, then run
 * data.sql (e.g. in the Supabase SQL editor). Read-only: nothing in the database is modified.
 */
import { Client } from "pg";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;
const quoteLiteral = (text: string) => `'${text.replace(/'/g, "''")}'`;

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL must be set (run with --env-file=.env)");

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // One snapshot for every table, so rows across tables stay consistent with each other.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const { rows: tableRows } = await client.query<{ name: string }>(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = tableRows.map((r) => r.name);

    const { rows: fkRows } = await client.query<{ child: string; parent: string }>(
      `SELECT DISTINCT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'`,
    );
    const unquote = (name: string) => name.replace(/^"|"$/g, "").replace(/""/g, '"');
    const parentsOf = new Map(tables.map((t) => [t, new Set<string>()]));
    for (const { child, parent } of fkRows) {
      if (child !== parent) parentsOf.get(unquote(child))?.add(unquote(parent));
    }

    // Parents before children, so data.sql restores without foreign-key violations.
    const ordered: string[] = [];
    const visiting = new Set<string>();
    const visit = (table: string) => {
      if (ordered.includes(table) || visiting.has(table)) return;
      visiting.add(table);
      for (const parent of parentsOf.get(table) ?? []) visit(parent);
      visiting.delete(table);
      ordered.push(table);
    };
    tables.forEach(visit);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join("backups", stamp);
    mkdirSync(outDir, { recursive: true });

    const manifest: Record<string, number> = {};
    const sql: string[] = [`-- Backup taken ${new Date().toISOString()}`, "BEGIN;", ""];

    for (const table of ordered) {
      const { rows } = await client.query<{ j: string }>(
        `SELECT row_to_json(t)::text AS j FROM ${quoteIdent(table)} t`,
      );
      manifest[table] = rows.length;
      writeFileSync(path.join(outDir, `${table}.json`), `[\n${rows.map((r) => r.j).join(",\n")}\n]\n`);

      sql.push(`-- ${table}: ${rows.length} rows`);
      for (const { j } of rows) {
        sql.push(
          `INSERT INTO ${quoteIdent(table)} SELECT * FROM json_populate_record(NULL::${quoteIdent(table)}, ${quoteLiteral(j)});`,
        );
      }
      sql.push("");
    }
    sql.push("COMMIT;", "");

    await client.query("COMMIT");

    writeFileSync(path.join(outDir, "data.sql"), sql.join("\n"));
    writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify({ takenAt: new Date().toISOString(), tables: manifest }, null, 2)}\n`);
    copyFileSync(path.join("prisma", "schema.prisma"), path.join(outDir, "schema.prisma"));

    const total = Object.values(manifest).reduce((a, b) => a + b, 0);
    for (const table of ordered) console.log(`${table.padEnd(24)} ${manifest[table]}`);
    console.log(`\n${total} rows from ${ordered.length} tables → ${outDir}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
