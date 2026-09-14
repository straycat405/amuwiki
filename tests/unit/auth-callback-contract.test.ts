import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "app/auth/callback/route.ts"),
  "utf8",
);

describe("authentication callback session contract", () => {
  it("writes exchanged Supabase cookies onto the redirect response", () => {
    expect(route).toContain("const response = NextResponse.redirect");
    expect(route).toContain("response.cookies.set(name, value, options)");
    expect(route).toContain("return response;");
  });
});
