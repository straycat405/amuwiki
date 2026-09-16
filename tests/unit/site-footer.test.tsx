import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/shell/site-footer";

describe("SiteFooter", () => {
  it("links to the real destination for each sitemap entry", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "문서" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "휴지통" })).toHaveAttribute("href", "/trash");
    expect(screen.getByRole("link", { name: "설정" })).toHaveAttribute("href", "/settings");
  });
});
