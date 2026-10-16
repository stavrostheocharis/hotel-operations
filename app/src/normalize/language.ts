import { francAll } from "franc";

/**
 * Language codes we emit. `el-latn` is Greeklish: Greek written in Latin
 * letters, which staff use in tickets ("klimatistiko den kryonei rm 312").
 */
export type LanguageCode =
  | "en"
  | "de"
  | "fr"
  | "it"
  | "el"
  | "ru"
  | "he"
  | "el-latn";

export type LanguageGuess = {
  language: LanguageCode | null;
  confidence: number;
  method: "script" | "greeklish" | "franc" | "stopwords" | "default" | "none";
};

const ISO3: Record<string, LanguageCode> = {
  eng: "en",
  deu: "de",
  fra: "fr",
  ita: "it",
  ell: "el",
  rus: "ru",
  heb: "he",
};

/** Greeklish vocabulary: function words plus the maintenance words staff use. */
const GREEKLISH = new Set([
  "den", "kai", "einai", "exei", "exoume", "exw", "sto", "stin", "ston", "sta", "stis", "stou",
  "tou", "tis", "tin", "ton", "mas", "mou", "sas", "ena", "mia", "poly", "polu", "para",
  "parapono", "pelati", "pelatis", "pelates", "domatio", "dwmatio", "dwm", "dom", "xalasmeno",
  "xalasmeni", "xalase", "xalasa", "klimatistiko", "nero", "zesto", "kryo", "kryonei",
  "douleuei", "leitourgei", "thelei", "allagi", "prepei", "apo", "gia", "oxi", "nai", "edw",
  "ekei", "simera", "xthes", "avrio", "mpanio", "ntous", "ntouz", "porta", "kleidi", "karta",
  "kartes", "kleidaria", "fws", "fota", "lampa", "lampes", "tileorasi", "tilekontrol",
  "asanser", "pisina", "thorivos", "thoryvos", "kounoupia", "sentonia", "petsetes",
  "katharismo", "katharismos", "vlavi", "episkevi", "episkeyi", "tsekarw", "tsekara",
  "ftiaxtike", "ftiaxno", "egine", "taktopoiithike", "parakalw", "efxaristw", "pistolaki",
  "psygeio", "vrastiras", "kourtina", "strwma", "strwmatos", "krevati", "balkoni", "mpalkoni",
  "kagkela", "xrimatokivwtio", "sidero", "tilexeiristirio", "xamam", "stazei", "trizei",
  "voulwmeno", "voulwse", "kazanaki", "sifoni", "allaksa", "allaxa", "antikatastasi",
  "antikatestisa", "epidiorthwsa", "kathara", "katharo", "etoimo", "pali", "ksana", "xana",
  "meta", "prin", "mexri", "oli", "olo", "oles", "mera", "vradi", "prwi", "apogevma", "tora",
  "twra", "ligo", "ligi", "liges", "polla", "kathe", "kapoio", "kati", "afto", "auto", "ekeino",
  "opws", "giati", "epeidi", "alla", "omws", "psekasmos", "anavosvinei", "kokkino", "mpataries",
  "mpataria", "exaerismos", "vgazei", "aera", "elegxos", "piesi", "myrwdia", "mouxlas",
  "apodytiria", "spasmeni", "spasmeno", "karekla", "kameni", "xwris", "xoris", "sima",
  "diarroi", "vrysi", "kainourgio", "antallaktiko", "paraggelia", "perimenoume", "anamoni",
  "syromeni", "kleinei", "anoigei", "pianei", "menteses", "ladi", "kremastra", "ntoulapa",
  "fouskwmeno", "roi", "apoxeteusi", "thermosifwnas", "thermosifonas", "boiler", "psyktis",
  "piestiko", "levitas", "alatwsi", "alatwseis", "katharisma", "allagh", "apostolh",
]);

/** English function words plus the maintenance vocabulary of staff notes. */
const EN_CUES = new Set([
  "the", "and", "not", "no", "is", "was", "were", "we", "our", "it", "in", "on", "at", "for",
  "with", "this", "that", "but", "very", "room", "guest", "water", "hot", "cold", "working",
  "works", "broken", "again", "still", "morning", "night", "ac", "tv", "wifi", "done", "ok",
  "fixed", "replaced", "replace", "checked", "check", "cleaned", "clean", "informed",
  "reports", "complains", "shower", "pool", "bar", "lift", "door", "key", "cards", "card",
  "light", "lights", "lamp", "safe", "towels", "remote", "batteries", "battery", "bulb",
  "filter", "test", "leak", "leaking", "dripping", "blocked", "drain", "toilet", "flush",
  "pressure", "noise", "noisy", "stuck", "repair", "repaired", "inspection", "monthly",
  "weekly", "annual", "quarterly", "service", "descaling", "gardens", "garden", "corridor",
  "emergency", "irrigation", "timers", "timer", "pump", "boiler", "chiller", "aircon",
  "minibar", "fridge", "lock", "balcony", "curtain", "mattress", "chair", "table", "request",
  "pest", "control", "fogging", "spray", "spraying", "bathroom", "ceiling", "wall", "floor",
  "building", "bldg", "villa", "rooms", "unit", "oil", "hinges", "loose", "rail", "railing",
  "steam", "generator", "sauna", "spa", "gym", "beach", "kitchen", "cushions", "sunbed",
  "sunbeds", "main", "plant", "roof", "terrace", "lobby", "reception", "staff", "called",
  "came", "visit", "parts", "waiting", "ordered", "quote", "contractor", "hold", "urgent",
  "urgently", "sparked", "flickering", "humming", "by", "from", "to", "of", "after", "before",
  "new", "old", "second", "time", "day", "days", "week", "all", "every", "needs", "need",
]);
const DE_CUES = new Set(["und", "nicht", "kein", "keine", "das", "die", "der", "ist", "war", "wir", "im", "zimmer", "wasser", "nacht", "sehr", "wieder", "morgen", "dusche", "mit", "auch", "aber", "ein", "eine", "noch", "schon", "seit", "jeden", "jede", "tag", "uns", "ich", "wurde", "beim"]);
const FR_CUES = new Set(["le", "la", "les", "pas", "et", "est", "était", "nous", "dans", "chambre", "eau", "pour", "une", "des", "très", "avec", "mais", "douche", "nuit", "matin", "on", "a", "ne", "du", "au", "ce", "cette", "depuis", "encore", "toujours"]);
const IT_CUES = new Set(["il", "la", "non", "e", "è", "era", "abbiamo", "nella", "camera", "acqua", "per", "una", "molto", "con", "ma", "doccia", "notte", "mattina", "sono", "che", "del", "della", "ancora", "sempre", "anche", "ci", "un", "al", "dal"]);

const GREEKLISH_ENDINGS = /(?:ei|oun|aki|iko|ikos|iki|eia|eio|oume|ete|ontas|etai|ountai|ises|isa|ame|ate|wsi|wsh|oi|ous|os)$/;

export function detectLanguage(text: string | null | undefined): LanguageGuess {
  if (!text) return { language: null, confidence: 0, method: "none" };
  const t = text.trim();
  const letters = t.match(/\p{L}/gu) ?? [];
  if (letters.length < 2) return { language: null, confidence: 0, method: "none" };

  const count = (re: RegExp) => (t.match(re) ?? []).length;
  const greek = count(/[Ͱ-Ͽἀ-῿]/g);
  const cyrillic = count(/[Ѐ-ӿ]/g);
  const hebrew = count(/[֐-׿]/g);
  const n = letters.length;

  if (greek / n > 0.5) return { language: "el", confidence: n >= 4 ? 0.99 : 0.8, method: "script" };
  if (cyrillic / n > 0.5) return { language: "ru", confidence: n >= 4 ? 0.97 : 0.8, method: "script" };
  if (hebrew / n > 0.5) return { language: "he", confidence: n >= 4 ? 0.99 : 0.8, method: "script" };

  const words = (t.toLowerCase().match(/[a-zàâäéèêëïîôöùûüçßñ']+/g) ?? []).map((w) =>
    w.replace(/'/g, ""),
  );
  if (!words.length) return { language: null, confidence: 0, method: "none" };
  const hits = (set: Set<string>) => words.filter((w) => set.has(w)).length;
  const gl = hits(GREEKLISH);
  const cue = cueVote(words);
  const en = hits(EN_CUES);

  // Greeklish: Latin letters but Greek words. Short staff notes are common.
  if (gl >= 2 && gl > en) {
    return { language: "el-latn", confidence: Math.min(0.95, 0.6 + 0.1 * gl), method: "greeklish" };
  }
  if (gl >= 1 && words.length <= 5 && en === 0 && !cue) {
    return { language: "el-latn", confidence: 0.7, method: "greeklish" };
  }

  // Short Latin-script text: cue words beat statistics.
  if (words.length < 8) {
    if (cue) return { language: cue, confidence: 0.6, method: "stopwords" };
    const greekish = words.filter((w) => w.length >= 4 && GREEKLISH_ENDINGS.test(w)).length;
    if (greekish >= 2 && en === 0) return { language: "el-latn", confidence: 0.55, method: "greeklish" };
    if (gl >= 1 && en === 0) return { language: "el-latn", confidence: 0.55, method: "greeklish" };
    // Staff notes default to English when nothing says otherwise.
    return { language: "en", confidence: 0.5, method: "default" };
  }

  // Statistical detection for the Latin-script languages we expect.
  const ranked = francAll(t, { only: ["eng", "deu", "fra", "ita"], minLength: 3 });
  const [best, second] = ranked;
  if (best && best[0] !== "und") {
    const margin = second ? best[1] - second[1] : 1;
    const code = ISO3[best[0]];
    if (code) {
      if (cue && cue !== code && words.length < 12) {
        return { language: cue, confidence: 0.6, method: "stopwords" };
      }
      return { language: code, confidence: Math.min(0.98, 0.55 + margin), method: "franc" };
    }
  }
  if (cue) return { language: cue, confidence: 0.55, method: "stopwords" };
  return { language: "en", confidence: 0.4, method: "default" };
}

function cueVote(words: string[]): LanguageCode | null {
  const scores: [LanguageCode, number][] = [
    ["en", words.filter((w) => EN_CUES.has(w)).length],
    ["de", words.filter((w) => DE_CUES.has(w)).length],
    ["fr", words.filter((w) => FR_CUES.has(w)).length],
    ["it", words.filter((w) => IT_CUES.has(w)).length],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0) return null;
  if (scores[1][1] === scores[0][1]) return null;
  return scores[0][0];
}
