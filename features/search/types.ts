export type SearchResult = {
  documentId: string;
  slug: string;
  title: string;
  summary: string;
  matchedAlias: string | null;
};

export type RecentSearch = {
  normalizedQuery: string;
  displayQuery: string;
  lastSearchedAt: string;
};
