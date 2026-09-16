/**
 * Converts the semantic HTML browsers put on the clipboard into portable Markdown.
 * Raw HTML is deliberately never returned: document rendering does not execute it.
 */
export function convertClipboardHtmlToMarkdown(html: string): string {
  const parser = new DOMParser();
  const root = parser.parseFromString(html, "text/html").body;
  return normalizeBlocks(Array.from(root.childNodes).map(renderBlock).join("\n\n"));
}

function renderBlock(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? "";
    return value.trim() ? escapeText(value) : "";
  }
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) {
    return `${"#".repeat(Number(tag[1]))} ${renderInlineChildren(node).trim()}`;
  }
  if (tag === "pre") return renderCodeBlock(node);
  if (tag === "blockquote") {
    return textLines(renderChildren(node)).map((line) => `> ${line}`).join("\n");
  }
  if (tag === "ul" || tag === "ol") return renderList(node, tag === "ol");
  if (tag === "table") return renderTable(node);
  if (tag === "hr") return "---";
  if (tag === "img") return renderImage(node);
  if (tag === "p" || tag === "figcaption") return renderInlineChildren(node).trim();
  if (isBlock(tag)) return renderChildren(node).trim();
  return renderInline(node);
}

function renderChildren(element: HTMLElement): string {
  return Array.from(element.childNodes).map(renderBlock).join("\n\n");
}

function renderInlineChildren(element: Element): string {
  return Array.from(element.childNodes).map(renderInline).join("");
}

function renderInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? "");
  if (!(node instanceof HTMLElement)) return "";

  const content = renderInlineChildren(node);
  switch (node.tagName.toLowerCase()) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${content}**`;
    case "em":
    case "i":
      return `*${content}*`;
    case "s":
    case "strike":
    case "del":
      return `~~${content}~~`;
    case "code":
      return inlineCode(node.textContent ?? "");
    case "a": {
      const href = node.getAttribute("href") ?? "";
      return isSafeUrl(href) ? `[${content}](${href})` : content;
    }
    case "img":
      return renderImage(node);
    default:
      return content;
  }
}

function renderCodeBlock(element: HTMLElement): string {
  const code = element.querySelector("code");
  const content = (code ?? element).textContent?.replace(/\n$/, "") ?? "";
  const language = code?.className.match(/(?:language-|lang-)([\w+-]+)/)?.[1] ?? "";
  const fence = fenceFor(content);
  return `${fence}${language}\n${content}\n${fence}`;
}

function renderList(element: HTMLElement, ordered: boolean): string {
  const items = Array.from(element.children).filter((child) => child.tagName === "LI");
  return items
    .map((item, index) => {
      const nested = Array.from(item.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && /^(UL|OL)$/.test(child.tagName),
      );
      const body = Array.from(item.childNodes)
        .filter((child) => !(child instanceof HTMLElement && /^(UL|OL)$/.test(child.tagName)))
        .map(renderInline)
        .join("")
        .trim();
      const checkbox = item.querySelector('input[type="checkbox"]');
      const marker =
        checkbox instanceof HTMLInputElement
          ? `- [${checkbox.checked ? "x" : " "}]`
          : ordered
            ? `${index + 1}.`
            : "-";
      const nestedMarkdown = nested.map((child) => renderList(child, child.tagName === "OL")).join("\n");
      return `${marker} ${body}${nestedMarkdown ? `\n${indent(nestedMarkdown)}` : ""}`.trimEnd();
    })
    .join("\n");
}

function renderTable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) =>
      renderInlineChildren(cell).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim(),
    ),
  );
  const width = rows[0]?.length ?? 0;
  if (width === 0) return "";
  const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  const header = normalizedRows[0] ?? [];
  const body = normalizedRows.slice(1);
  return [header, Array(width).fill("---"), ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function renderImage(image: HTMLElement): string {
  const src = image.getAttribute("src") ?? "";
  const alt = image.getAttribute("alt") ?? "";
  return isSafeUrl(src) ? `![${alt}](${src})` : "";
}

function inlineCode(content: string): string {
  const ticks = Math.max(...Array.from(content.matchAll(/`+/g), (match) => match[0].length), 0) + 1;
  return `${"`".repeat(ticks)}${content}${"`".repeat(ticks)}`;
}

function fenceFor(content: string): string {
  const ticks = Math.max(...Array.from(content.matchAll(/`+/g), (match) => match[0].length), 2) + 1;
  return "`".repeat(ticks);
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([*_\[\]<>])/g, "\\$1");
}

function isBlock(tag: string): boolean {
  return ["p", "div", "section", "article", "main", "figure", "figcaption"].includes(tag);
}

function isSafeUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:|\/)/i.test(value);
}

function textLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function indent(value: string): string {
  return value.split("\n").map((line) => `  ${line}`).join("\n");
}

function normalizeBlocks(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}
