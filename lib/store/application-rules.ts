// Validation rules for the Insight Store seller application. Pure functions,
// shared by the form (instant feedback) and the API (the actual enforcement).

/** What applicants are told about review time. */
export const APPROVAL_WINDOW = "2 to 18 days";
export const APPROVAL_NOTE = `Approval usually takes ${APPROVAL_WINDOW}. You can keep using the parts of Insight your package already includes while you wait.`;

/** Fields every application must complete. Registration number is the only optional box. */
export const REQUIRED_FIELDS = [
  "registeredName", "tradingName", "businessType", "description",
  "address", "country", "region", "city", "phone", "email",
  "repName", "repPosition", "repPhone", "repEmail",
  "categories", "productCount", "onlinePresence", "fulfilment",
] as const;

export const OPTIONAL_FIELDS = ["registrationNumber"] as const;

export const FIELD_NAMES: Record<string, string> = {
  registeredName: "Registered business name", tradingName: "Trading name", businessType: "Business type",
  description: "Business description", address: "Business address", country: "Country", region: "Region", city: "City",
  phone: "Contact phone", email: "Business email", repName: "Representative's full name",
  repPosition: "Representative's position", repPhone: "Representative's contact number", repEmail: "Representative's email",
  categories: "Product categories", productCount: "Approximate number of products",
  onlinePresence: "Website or social pages", fulfilment: "Order fulfilment method", shopAddress: "Physical shop address",
};

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
export const validEmail = (s: string) => s.length <= 160 && !s.includes("..") && EMAIL.test(s.trim());

export const isGhana = (country?: string | null) => (country ?? "").trim().toLowerCase() === "ghana";

/** Ghana numbers: digits only, at most 10 (e.g. 0241234567). Elsewhere: a normal international number. */
export function phoneProblem(country: string | null | undefined, phone: string): string | null {
  const p = phone.trim();
  if (!p) return null;
  if (isGhana(country)) {
    if (!/^\d+$/.test(p)) return "Use digits only, for example 0241234567.";
    if (p.length > 10) return "Ghana phone numbers can't be longer than 10 digits.";
    if (p.length < 9) return "That phone number is too short.";
    return null;
  }
  if (!/^\+?[\d\s().-]+$/.test(p)) return "Use digits only (a leading + is fine).";
  const digits = p.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return "Enter a valid phone number.";
  return null;
}

const blank = (v: unknown) => (Array.isArray(v) ? v.length === 0 : v === undefined || v === null || String(v).trim() === "");

export type Documents = { key: string; label: string; required: boolean }[];

/** Documents that depend on the answers: a physical shop must identify its owner. */
export function conditionalDocuments(data: Record<string, unknown>): Documents {
  return data?.physicalPresence === true
    ? [{ key: "owner_id", label: "Photo of your Ghana Card or Voter's ID", required: true }]
    : [];
}

export const CONDITIONAL_DOC_KEYS = ["owner_id"];

/** Field → message for everything wrong with the answers. Empty object = good to submit. */
export function applicationProblems(data: Record<string, unknown>, { forSubmit = true } = {}): Record<string, string> {
  const d = (data ?? {}) as Record<string, any>;
  const out: Record<string, string> = {};
  const required: string[] = [...REQUIRED_FIELDS];
  if (d.physicalPresence === true) required.push("shopAddress");
  if (forSubmit) for (const k of required) if (blank(d[k])) out[k] = `${FIELD_NAMES[k] ?? k} is required.`;
  for (const k of ["email", "repEmail"]) {
    if (!blank(d[k]) && !validEmail(String(d[k]))) out[k] = "Enter a valid email address, like name@example.com.";
  }
  for (const k of ["phone", "repPhone"]) {
    if (blank(d[k])) continue;
    const p = phoneProblem(d.country, String(d[k]));
    if (p) out[k] = p;
  }
  return out;
}

export function missingDocuments(data: Record<string, unknown>, config: Documents, uploaded: string[]): string[] {
  const all = [...config.filter((d) => d.required), ...conditionalDocuments(data)];
  return all.filter((d) => !uploaded.includes(d.key)).map((d) => d.label);
}
