/**
 * Public site navigation.
 *
 * Deliberately a plain module, not an export of the showcase client
 * component: a value exported from a "use client" file reaches a server
 * component as a client reference, not the array itself, so the footer could
 * not map over it.
 */
export interface NavLink { label: string; href: string }

export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Insight Store", href: "/store" },
  { label: "About Us", href: "/#about" },
];
