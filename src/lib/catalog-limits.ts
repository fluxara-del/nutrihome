// One-process protection for the intended single-instance SQLite deployment.
const attempts = new Map<string, { count: number; expires: number }>();
export function allowCatalogRequest(userId: string, kind: "search" | "ocr", now = Date.now()) {
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = `${userId}:${kind}`, current = attempts.get(key);
  if (current && current.count >= (kind === "ocr" ? 5 : 30)) return false;
  if (current) current.count++; else attempts.set(key, { count: 1, expires: now + 60000 });
  return true;
}
