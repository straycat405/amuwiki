export type RecentView = {
  documentId: string;
  slug: string;
  title: string;
  summary: string;
  lastViewedAt: string;
};

export type RecentViewsPage = {
  views: RecentView[];
  hasMore: boolean;
};
