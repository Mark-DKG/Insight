import InsightLogin from "@/components/login";

// The login screen already has a "Create Business Account" tab built in,
// so /register renders the same component, just opened on that tab.
export default function Page() {
  return <InsightLogin initialMode="register" />;
}
