import type { TocEntry } from "@/lib/markdown/toc";

type TocNode = TocEntry & { children: TocNode[] };

function buildTree(entries: TocEntry[]): TocNode[] {
  const root: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const entry of entries) {
    const node: TocNode = { ...entry, children: [] };
    while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
      stack.pop();
    }
    (stack[stack.length - 1]?.children ?? root).push(node);
    stack.push(node);
  }

  return root;
}

function TocList({ nodes }: { nodes: TocNode[] }) {
  return (
    <ol className="toc__list">
      {nodes.map((node) => (
        <li key={node.slug} className="toc__item">
          <a href={`#${node.slug}`}>{node.text}</a>
          {node.children.length > 0 ? <TocList nodes={node.children} /> : null}
        </li>
      ))}
    </ol>
  );
}

export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <details className="toc" open>
      <summary className="toc__summary">목차</summary>
      <TocList nodes={buildTree(entries)} />
    </details>
  );
}
