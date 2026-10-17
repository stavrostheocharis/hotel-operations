import { en, type Dict } from "./en";

/**
 * `t("signIn.errors.wrong")` → the English string, typed: a key that is not a
 * leaf of the dictionary does not compile. `{name}` placeholders are filled
 * from `vars`. No library; adding Greek is `el.ts` typed as `Dict` plus a
 * `users.locale` switch here.
 */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends readonly string[]
      ? `${Prefix}${K}`
      : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TKey = Leaves<Dict>;

const dictionaries: Record<string, Dict> = { en };

export function getDictionary(locale = "en"): Dict {
  return dictionaries[locale] ?? en;
}

function lookup(dict: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), dict);
}

export function t(key: TKey, vars?: Record<string, string | number>, locale = "en"): string {
  const value = lookup(getDictionary(locale), key);
  const text = typeof value === "string" ? value : Array.isArray(value) ? value.join("\n") : key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** A list leaf (bullets) as an array. */
export function tList(key: TKey, locale = "en"): readonly string[] {
  const value = lookup(getDictionary(locale), key);
  return Array.isArray(value) ? (value as readonly string[]) : typeof value === "string" ? [value] : [];
}

/** A label from one of the enum maps, falling back to the raw value. */
export function label(group: "status" | "source" | "method" | "user.role" | "user.department", value: string | null | undefined, locale = "en"): string {
  if (!value) return "";
  const map = lookup(getDictionary(locale), group);
  const found = map && typeof map === "object" ? (map as Record<string, string>)[value] : undefined;
  return found ?? value.replace(/_/g, " ");
}
