import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202609140001_initial_schema.sql"),
  "utf8",
);

const ownerScopedTables = [
  "profiles",
  "user_preferences",
  "documents",
  "document_aliases",
  "document_links",
  "document_revisions",
  "annotations",
  "recent_views",
  "recent_searches",
  "attachments",
  "import_jobs",
  "import_items",
  "export_jobs",
] as const;

describe("initial database security contract", () => {
  it.each(ownerScopedTables)("enables RLS on %s", (table) => {
    expect(migration).toContain(
      `alter table public.${table} enable row level security;`,
    );
  });

  it("removes anonymous table access", () => {
    expect(migration).toContain(
      "revoke all on all tables in schema public from anon;",
    );
  });

  it("does not grant the service role in application migrations", () => {
    expect(migration).not.toMatch(/grant .* service_role/i);
  });
});
