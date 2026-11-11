/**
 * Insight landing page — product showcase configuration.
 *
 * EDITING THIS FILE IS HOW YOU CHANGE THE SHOWCASE. Add, remove or reorder
 * entries and the homepage follows: slides, thumbnails, prev/next, keyboard
 * navigation and the background treatment are all derived from this array.
 * There is no fixed number of products.
 *
 * Honesty contract, deliberately enforced by the types below:
 *   - `brand` and `type` are the only fields the showcase needs.
 *   - `model`, `price`, `category`, `features`, `sku` and `href` are all
 *     optional and are OMITTED FROM THE PAGE when unset. Nothing is
 *     substituted, inferred or filled in with a plausible-looking value.
 *   - No price, specification, availability or discount appears anywhere
 *     unless it is written here by hand.
 *
 * Provenance of the current entries:
 *   - "Urbanista", "Nike" and "TIASTAR" are read directly off the product
 *     photographs.
 *   - "Toshiba" and "Lacoste" were supplied by the site owner.
 *   - No model designation was legible on any of the five photographs, so
 *     every `model` is left unset. Fill them in and they appear automatically.
 */

export interface ShowcaseProduct {
  /** Stable key. Used for React keys and the `?product=` deep link. */
  id: string;
  /** Manufacturer. Shown as the headline label for the slide. */
  brand: string;
  /** Neutral description of what the item is. Not a specification claim. */
  type: string;
  /** Model or product line. Unset = not shown. Never guessed. */
  model?: string;
  /** Path under /public. Transparent PNG so the product floats on the panel. */
  image: string;
  /** Descriptive alt text for screen readers and image search. */
  alt: string;
  /** Showcase accent, mid and deep stops of the backdrop gradient. */
  accent: string;
  accentDeep: string;
  /** Tone of the panel glow behind the product. */
  glow: string;
  /** Optional, omitted from the page when unset. */
  category?: string;
  price?: string;
  features?: string[];
  sku?: string;
  /** Where the slide's call to action points. Unset = no CTA rendered. */
  href?: string;
}

export const SHOWCASE_PRODUCTS: ShowcaseProduct[] = [
  {
    id: "urbanista-headphones",
    brand: "Urbanista",
    type: "Wireless Over-Ear Headphones",
    image: "/products/headphones.png",
    alt: "Urbanista wireless over-ear headphones in deep red, shown at three-quarter angle",
    accent: "#B3243C",
    accentDeep: "#5C0F20",
    glow: "rgba(201, 46, 72, 0.42)",
  },
  {
    id: "toshiba-vr",
    brand: "Toshiba",
    type: "VR Headset and Controllers",
    image: "/products/vr-headset.png",
    alt: "Toshiba virtual reality headset in white with a fabric head strap and two hand controllers",
    accent: "#4C6B8A",
    accentDeep: "#17293C",
    glow: "rgba(120, 165, 210, 0.38)",
  },
  {
    id: "nike-sneakers",
    brand: "Nike",
    type: "Suede Low-Top Sneakers",
    image: "/products/sneakers.png",
    alt: "Pair of Nike navy suede low-top sneakers with cream laces and cream swoosh",
    accent: "#2D4A7A",
    accentDeep: "#101D33",
    glow: "rgba(96, 140, 206, 0.38)",
  },
  {
    id: "lacoste-handbags",
    brand: "Lacoste",
    type: "Handbag and Accessory Set",
    image: "/products/handbag-set.png",
    alt: "Lacoste handbag set in tan, white and black with matching clutch, card holder and pouch",
    accent: "#B5712F",
    accentDeep: "#4A2A0E",
    glow: "rgba(214, 142, 70, 0.40)",
  },
  {
    id: "tiastar-processor",
    brand: "TIASTAR",
    type: "Multi-Function Food Processor",
    image: "/products/food-processor.png",
    alt: "TIASTAR multi-function food processor with blender jug, grinder, juicer and cutting discs",
    accent: "#5E6B72",
    accentDeep: "#1C2429",
    glow: "rgba(158, 178, 190, 0.34)",
  },
];

/** Display name for a slide: brand, plus the model only when one is known. */
export function productTitle(p: ShowcaseProduct): string {
  return p.model ? `${p.brand} ${p.model}` : p.brand;
}
