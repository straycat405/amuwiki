import { LogOut, Plus, Search, Settings } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";

export function AppHeader() {
  return (
    <header className="app-header">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <Link className="brand" href="/" aria-label="아무위키 홈">
        <span className="brand__mark" aria-hidden="true" />
        <span>아무위키</span>
      </Link>
      <button className="search-button" type="button" aria-label="문서 검색">
        <Search size={17} aria-hidden="true" />
        <span>검색</span>
        <kbd>⌘ K</kbd>
      </button>
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
