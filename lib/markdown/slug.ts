export function normalizeConcept(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function slugifyDocumentTitle(value: string): string {
  return normalizeConcept(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export function slugifyHeading(value: string): string {
  return slugifyDocumentTitle(value);
}
