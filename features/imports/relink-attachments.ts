const IMAGE_REF_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function isFenceLine(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

/** Resolves a Markdown image reference relative to the file that contains it, within the ZIP's own path space. */
export function resolveZipRelativePath(fromRelativePath: string, ref: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return null; // has a scheme (http:, data:, mailto:...)
  if (ref.startsWith("#")) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(ref.split("#")[0]!.split("?")[0]!);
  } catch {
    return null;
  }

  const baseDir = fromRelativePath.split("/").slice(0, -1);
  const segments = [...baseDir, ...decoded.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.length > 0 ? resolved.join("/") : null;
}

/** Every relative image reference in a document's body, resolved to a ZIP-relative path (skips fenced code blocks). */
export function findAttachmentReferences(
  bodyMarkdown: string,
  fromRelativePath: string,
): { ref: string; resolvedPath: string }[] {
  const found: { ref: string; resolvedPath: string }[] = [];
  let inFence = false;
  for (const line of bodyMarkdown.split("\n")) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.matchAll(IMAGE_REF_PATTERN)) {
      const ref = match[2];
      if (!ref) continue;
      const resolvedPath = resolveZipRelativePath(fromRelativePath, ref);
      if (resolvedPath) found.push({ ref, resolvedPath });
    }
  }
  return found;
}

/** Replaces image references whose resolved ZIP path is a key in `urlByResolvedPath`; everything else is untouched. */
export function applyAttachmentReplacements(
  bodyMarkdown: string,
  fromRelativePath: string,
  urlByResolvedPath: Map<string, string>,
): string {
  const lines = bodyMarkdown.split("\n");
  let inFence = false;
  const output = lines.map((line) => {
    if (isFenceLine(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line.replace(IMAGE_REF_PATTERN, (match, alt: string, ref: string) => {
      const resolvedPath = resolveZipRelativePath(fromRelativePath, ref);
      const newUrl = resolvedPath ? urlByResolvedPath.get(resolvedPath) : undefined;
      return newUrl ? `![${alt}](${newUrl})` : match;
    });
  });
  return output.join("\n");
}
