export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins?: string[]): boolean {
  if (!origin) return true;
  const list = allowedOrigins ?? [];
  return list.includes(origin.replace(/\/+$/, ""));
}
