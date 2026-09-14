import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DocumentLifecycleButton } from "@/components/document/document-lifecycle-button";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("DocumentLifecycleButton", () => {
  it.each([
    ["archive", "휴지통"],
    ["restore", "복원"],
  ] as const)("renders the %s action", (kind, label) => {
    render(
      <DocumentLifecycleButton
        action={vi.fn().mockResolvedValue({ status: "idle", message: "" })}
        kind={kind}
      />,
    );

    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  });
});
