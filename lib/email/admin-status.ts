import { prisma } from "@/lib/prisma";
import { emailConfig, maskAddress } from "./config";
import { getEmailState } from "./service";

// Read-only status for the Super Admin Email section. Never returns the API
// key, webhook secret, tokens or any message content.

async function domains() {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  if (!key) return { available: false as const, reason: "No API key configured." };
  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { available: false as const, reason: `Resend returned HTTP ${res.status}. A sending-only API key cannot list domains.` };
    const data: any = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    return { available: true as const, domains: list.map((d: any) => ({ name: String(d.name), status: String(d.status), region: d.region ? String(d.region) : null })) };
  } catch {
    return { available: false as const, reason: "Could not reach Resend." };
  }
}

export async function adminEmailStatus() {
  const cfg = emailConfig();
  const state = await getEmailState(cfg);
  const since = new Date(Date.now() - 7 * 86400_000);
  const [byStatus, byCategory, recent, queued, domain, setting] = await Promise.all([
    prisma.emailMessage.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.emailMessage.groupBy({ by: ["category"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { id: true, category: true, template: true, toAddress: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true, deliveredAt: true } }),
    prisma.emailMessage.count({ where: { status: "QUEUED" } }),
    domains(),
    prisma.emailSetting.findUnique({ where: { id: "default" } }),
  ]);
  return {
    state,
    config: {
      provider: cfg.provider,
      fromName: cfg.fromName,
      fromAddress: cfg.fromAddress,
      usingTestSender: cfg.usingTestSender,
      replyTo: cfg.replyTo,
      appUrl: cfg.appUrl,
      apiKeyConfigured: cfg.apiKeyConfigured,
      webhookSecretConfigured: cfg.webhookSecretConfigured,
      cronSecretConfigured: (process.env.CRON_SECRET ?? "").trim().length > 0,
      centralAddress: state.centralAddress,
      centralAddressOverridden: !!setting?.centralAddress,
    },
    domain,
    queued,
    last7Days: { byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])), byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])) },
    recent: recent.map((m) => ({ ...m, toAddress: maskAddress(m.toAddress) })),
  };
}
