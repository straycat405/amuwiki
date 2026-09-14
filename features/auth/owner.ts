export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function isOwnerEmail(email: string | null | undefined, ownerEmail: string) {
  return Boolean(email && normalizeEmail(email) === normalizeEmail(ownerEmail));
}

export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
