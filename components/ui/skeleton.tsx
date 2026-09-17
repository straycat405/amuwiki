import type { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
};

/** A shimmering placeholder block for loading UI. Purely decorative — hidden from assistive tech. */
export function Skeleton({ className = "", width, height, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`}
      style={{ width, height, ...style }}
    />
  );
}
