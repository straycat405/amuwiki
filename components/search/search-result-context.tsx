type SearchResultContextProps = {
  context: string;
  query: string;
  className?: string;
};

export function SearchResultContext({
  context,
  query,
  className,
}: SearchResultContextProps) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return <span className={className}>{context}</span>;

  const normalizedContext = context.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = normalizedContext.indexOf(normalizedQuery, cursor);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(context.slice(cursor, matchIndex));
    const end = matchIndex + normalizedQuery.length;
    parts.push(<mark key={matchIndex}>{context.slice(matchIndex, end)}</mark>);
    cursor = end;
    matchIndex = normalizedContext.indexOf(normalizedQuery, cursor);
  }

  if (cursor < context.length) parts.push(context.slice(cursor));

  return <span className={className}>{parts}</span>;
}
import type { ReactNode } from "react";
