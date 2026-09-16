import { describe, expect, it } from "vitest";

import { groupRecentViewsByDate } from "@/features/history/group-recent-views";
import type { RecentView } from "@/features/history/types";

const NOW = new Date("2026-09-16T10:00:00Z");

function view(id: string, daysAgo: number): RecentView {
  const date = new Date(NOW);
  date.setDate(date.getDate() - daysAgo);
  return { documentId: id, slug: id, title: id, summary: "", lastViewedAt: date.toISOString() };
}

describe("groupRecentViewsByDate", () => {
  it("buckets views into 오늘/어제/지난 7일/지난 30일/이전", () => {
    const views = [
      view("today", 0),
      view("yesterday", 1),
      view("this-week", 5),
      view("this-month", 20),
      view("older", 90),
    ];

    const groups = groupRecentViewsByDate(views, NOW);

    expect(groups.map((g) => g.label)).toEqual(["오늘", "어제", "지난 7일", "지난 30일", "이전"]);
    expect(groups.map((g) => g.views.map((v) => v.documentId))).toEqual([
      ["today"],
      ["yesterday"],
      ["this-week"],
      ["this-month"],
      ["older"],
    ]);
  });

  it("omits empty groups", () => {
    const groups = groupRecentViewsByDate([view("today", 0)], NOW);
    expect(groups).toEqual([{ label: "오늘", views: [view("today", 0)] }]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupRecentViewsByDate([], NOW)).toEqual([]);
  });

  it("treats a future timestamp (clock skew) as 오늘 rather than throwing it away", () => {
    const futureView = view("future", -1);
    const groups = groupRecentViewsByDate([futureView], NOW);
    expect(groups).toEqual([{ label: "오늘", views: [futureView] }]);
  });

  it("preserves the given order within a group", () => {
    const first = view("a", 0);
    const second = view("b", 0);
    const groups = groupRecentViewsByDate([first, second], NOW);
    expect(groups[0]!.views).toEqual([first, second]);
  });
});
