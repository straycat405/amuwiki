import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const rootLayout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

describe("root layout script contract", () => {
  it("loads the appearance initializer through next/script before hydration", () => {
    expect(rootLayout).toContain('import Script from "next/script"');
    expect(rootLayout).toContain('strategy="beforeInteractive"');
    expect(rootLayout).not.toMatch(/<script\b/);
  });
});
