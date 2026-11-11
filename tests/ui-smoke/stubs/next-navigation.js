const r = { push: (u) => console.log("[nav] push " + u), replace: (u) => console.log("[nav] replace " + u), refresh: () => {}, back: () => {}, prefetch: () => {} };
exports.useRouter = () => r;
exports.usePathname = () => window.location.pathname;
exports.useSearchParams = () => new URLSearchParams(window.location.search);
exports.redirect = () => {};
