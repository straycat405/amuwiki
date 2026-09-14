import { LogOut, Plus, Settings } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { CommandPalette } from "@/components/search/command-palette";
import { SidebarToggleButton } from "@/components/shell/sidebar-toggle-button";

export function AppHeader() {
  return (
    <header className="app-header">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <div className="header-leading">
        <SidebarToggleButton />
        <Link className="brand" href="/" aria-label="아무위키 홈">
          <span className="brand__mark" aria-hidden="true" />
          <span>아무위키</span>
        </Link>
      </div>
      <CommandPalette />
      <div className="header-actions">
        <Link
          className="icon-button"
          href="/documents/new"
          aria-label="새 문서"
        >
          <Plus size={20} aria-hidden="true" />
        </Link>
        <Link className="icon-button" href="/settings" aria-label="설정">
          <Settings size={19} aria-hidden="true" />
        </Link>
        <form action={signOut}>
          <button className="icon-button" type="submit" aria-label="로그아웃">
            <LogOut size={19} aria-hidden="true" />
          </button>
        </form>
      </div>
    </header>
  );
}
