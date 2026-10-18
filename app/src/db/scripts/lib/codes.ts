import { createHash } from "node:crypto";

/**
 * Location codes from names a client's export carries: Greek (and any
 * accented Latin) is transliterated instead of dropped, so Πισίνα becomes
 * PISINA rather than X and two Greek facilities never merge. Codes are
 * what the console shows next to a place and what aliases resolve to.
 */
const GREEK: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n",
  ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};
/** ELOT 743: μπ/ντ/γκ are b/d/g at the start of a word, mp/nt/gk inside it. */
const DIGRAPHS: [RegExp, string][] = [
  [/ου/g, "ou"],
  [/αυ/g, "av"],
  [/ευ/g, "ev"],
  [/(^|[^\p{L}])μπ/gu, "$1b"],
  [/(^|[^\p{L}])ντ/gu, "$1d"],
  [/(^|[^\p{L}])γκ/gu, "$1g"],
  [/μπ/g, "mp"],
  [/ντ/g, "nt"],
  [/γκ/g, "gk"],
];

export function transliterate(text: string): string {
  let s = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (const [re, to] of DIGRAPHS) s = s.replace(re, to);
  return s.replace(/[α-ω]/g, (ch) => GREEK[ch] ?? ch);
}

/** "Εστιατόριο Ορίζοντας" → "ESTIATORIO-ORIZONTAS"; never empty. */
export function slugCode(text: string, max = 24): string {
  const s = transliterate(text)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, max).replace(/-$/, "") || "X";
}

/** Four hex characters of a name, for a code that would otherwise collide. */
export function hash4(text: string): string {
  return createHash("sha1").update(text.trim().toLowerCase()).digest("hex").slice(0, 4).toUpperCase();
}
