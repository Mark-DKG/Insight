import { prisma } from "@/lib/prisma";

// Fixed-window limiter backed by the existing AuthAttempt table, so it holds
// across serverless instances without extra infrastructure.
export async function rateLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs);
  try {
    const count = await prisma.authAttempt.count({ where: { key, createdAt: { gte: since } } });
    if (count >= max) return true;
    await prisma.authAttempt.create({ data: { key } });
    return false;
  } catch {
    return false; // never block users because the limiter's own storage failed
  }
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
