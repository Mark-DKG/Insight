import { ContactForm } from "@/components/contact-form";
import { emailConfig } from "@/lib/email/config";

export const metadata = { title: "Contact | Insight" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <ContactForm address={emailConfig().contactAddress} />;
}
