import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarProvider } from "@/components/shell/sidebar-provider";
import { SidebarToggleButton } from "@/components/shell/sidebar-toggle-button";

describe("sidebar collapse toggle", () => {
  it("toggles the app-shell's data-sidebar attribute", () => {
    const { container } = render(
      <SidebarProvider>
        <SidebarToggleButton />
      </SidebarProvider>,
    );

    const shell = container.querySelector(".app-shell");
    expect(shell).not.toHaveAttribute("data-sidebar");

    fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(shell).toHaveAttribute("data-sidebar", "collapsed");

    fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
    expect(shell).not.toHaveAttribute("data-sidebar");
  });
});
