import type { RecentView } from "@/features/history/types";

const GROUP_LABELS = ["오늘", "어제", "지난 7일", "지난 30일", "이전"] as const;
type GroupLabel = (typeof GROUP_LABELS)[number];

export type RecentViewGroup = {
  label: GroupLabel;
  views: RecentView[];
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function groupLabelFor(lastViewedAt: string, now: Date): GroupLabel {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(new Date(lastViewedAt))) / 86_400_000);
  if (daysAgo <= 0) return "오늘";
  if (daysAgo === 1) return "어제";
  if (daysAgo <= 7) return "지난 7일";
  if (daysAgo <= 30) return "지난 30일";
  return "이전";
}

/** Buckets already-sorted recent views into ChatGPT/VS Code-style date groups (empty groups omitted). */
export function groupRecentViewsByDate(
  views: RecentView[],
  now: Date = new Date(),
): RecentViewGroup[] {
  const byLabel = new Map<GroupLabel, RecentView[]>(GROUP_LABELS.map((label) => [label, []]));
  for (const view of views) {
    byLabel.get(groupLabelFor(view.lastViewedAt, now))!.push(view);
  }
  return GROUP_LABELS.map((label) => ({ label, views: byLabel.get(label)! })).filter(
    (group) => group.views.length > 0,
  );
}
