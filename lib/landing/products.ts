/**
 * Insight landing page — product showcase configuration.
 *
 * EDITING THIS FILE IS HOW YOU CHANGE THE SHOWCASE. Add, remove or reorder
 * entries and the homepage follows: slides, pagination dots, prev/next,
 * keyboard navigation and the backdrop colours are all derived from this array.
 *
 * Honesty contract, enforced by the types below:
 *   - `title` and `type` are the only fields the showcase needs.
 *   - `description`, `price`, `href` are optional and are OMITTED FROM THE PAGE
 *     when unset. Nothing is substituted, inferred or invented.
 *   - No price, specification or availability appears unless written here.
 *
 * The images are the six PNGs supplied by the site owner, used byte-for-byte
 * as provided (transparent backgrounds, original dimensions). `w`/`h` are
 * their intrinsic pixel size, used to reserve layout space.
 *
 * Provenance of the names:
 *   - "Urbanista" and "Saint Laurent" are printed on the products themselves.
 *   - "Lacoste" was supplied by the site owner.
 *   - The knife block, gown and boots show no legible brand, so they carry a
 *     plain description of what they are instead of a made-up brand.
 */

export interface ShowcaseProduct {
  /** Stable key. Used for React keys and the `?product=` deep link. */
  id: string;
  /** Headline shown on the right of the showcase. */
  title: string;
  /** Neutral description of what the item is. Not a specification claim. */
  type: string;
  /** Path under /public. */
  image: string;
  /** Intrinsic size of the supplied image, in px. */
  w: number;
  h: number;
  /** Descriptive alt text. */
  alt: string;
  /** Side-strip colour (sampled from the product itself) and the spotlight glow. */
  accent: string;
  glow: string;
  /** Optional. Omitted from the page when unset. */
  description?: string;
  price?: string;
  /** Where the slide's call to action points. Defaults to the marketplace. */
  href?: string;
}

export const SHOWCASE_PRODUCTS: ShowcaseProduct[] = [
  {
    id: "urbanista-headphones",
    title: "Urbanista",
    type: "Over-Ear Headphones",
    image: "/products/headphones.png", w: 596, h: 784,
    alt: "Urbanista over-ear headphones in deep red, shown at a three-quarter angle",
    accent: "#9E2E44", glow: "rgba(176, 52, 78, 0.34)",
  },
  {
    id: "lacoste-handbags",
    title: "Lacoste",
    type: "Handbag & Accessory Set",
    image: "/products/handbag-set.png", w: 734, h: 594,
    alt: "Lacoste handbag set in tan, white and black with a matching clutch, card holder and pouch",
    accent: "#B26A3C", glow: "rgba(200, 128, 80, 0.32)",
  },
  {
    id: "knife-block",
    title: "Knife Block Set",
    type: "Wood-Finish Kitchen Knives",
    image: "/products/knife-block.png", w: 578, h: 746,
    alt: "Block of kitchen knives with wood-grain handles in a matching wooden block",
    accent: "#7E4A38", glow: "rgba(150, 92, 70, 0.32)",
  },
  {
    id: "bow-gown",
    title: "Bow-Sleeve Gown",
    type: "Fuchsia Evening Dress",
    image: "/products/gown.png", w: 668, h: 882,
    alt: "Fuchsia floor-length gown with a sweetheart neckline and large oversized bow sleeves",
    accent: "#E0065A", glow: "rgba(236, 30, 120, 0.32)",
  },
  {
    id: "saint-laurent-heels",
    title: "Saint Laurent",
    type: "Pointed-Toe Pumps",
    image: "/products/heels.png", w: 557, h: 506,
    alt: "Pair of cobalt-blue pointed-toe stiletto pumps marked Saint Laurent Paris",
    accent: "#0A5CC8", glow: "rgba(30, 110, 220, 0.34)",
  },
  {
    id: "platform-boots",
    title: "Platform Boots",
    type: "Pink Patent Mid-Calf Boots",
    image: "/products/boots.png", w: 387, h: 679,
    alt: "Pair of glossy pink patent platform boots with a chunky block heel",
    accent: "#DB5788", glow: "rgba(232, 96, 150, 0.32)",
  },
];
