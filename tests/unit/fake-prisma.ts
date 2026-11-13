// In-memory stand-in for the parts of Prisma the email service uses. Tests only; no network, no database.
export const db = { messages: [] as any[], setting: null as any, n: 0 };
export function resetDb() { db.messages = []; db.setting = null; db.n = 0; }
const dup = () => Object.assign(new Error("dup"), { code: "P2002" });
export const prisma = {
  emailSetting: { findUnique: async () => db.setting },
  emailMessage: {
    findUnique: async ({ where }: any) => db.messages.find((m) => (where.id ? m.id === where.id : m.idempotencyKey === where.idempotencyKey)) ?? null,
    create: async ({ data }: any) => {
      if (db.messages.some((m) => m.idempotencyKey === data.idempotencyKey)) throw dup();
      const row = { id: `m${++db.n}`, attempts: 0, status: "QUEUED", payload: null, providerId: null, lastError: null, nextAttemptAt: new Date(), createdAt: new Date(), updatedAt: new Date(), ...data };
      if (row.payload === undefined) row.payload = null;
      db.messages.push(row); return { ...row };
    },
    update: async ({ where, data }: any) => {
      const row = db.messages.find((m) => m.id === where.id); Object.assign(row, data, { updatedAt: new Date() });
      if (data.payload && data.payload.__dbnull) row.payload = null; return { ...row };
    },
    updateMany: async () => ({ count: 0 }),
    findMany: async ({ where }: any) => db.messages.filter((m) => m.status === where.status && m.nextAttemptAt <= where.nextAttemptAt.lte),
  },
};
export const Prisma = { DbNull: { __dbnull: true } };
