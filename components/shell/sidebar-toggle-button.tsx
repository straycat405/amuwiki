"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useSidebar } from "@/components/shell/sidebar-provider";

export function SidebarToggleButton() {
  const { collapsed, toggle } = useSidebar();

  return (
    <button
      className="icon-button sidebar-toggle"
      type="button"
      aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      onClick={toggle}
    >
      {collapsed ? (
        <PanelLeftOpen size={19} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={19} aria-hidden="true" />
      )}
    </button>
  );
}
