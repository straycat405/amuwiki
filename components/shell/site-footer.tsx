import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="사이트맵">
        <Link href="/">문서</Link>
        <Link href="/trash">휴지통</Link>
        <Link href="/settings">설정</Link>
      </nav>
      <span>아무위키 v0.1</span>
    </footer>
  );
}
