/**
 * JavaScript's `\b` and `\w` are ASCII-only, even with the `u` flag, so a
 * pattern like /\bκάρτα\b/ never matches Greek, Cyrillic or Hebrew text.
 * These helpers rewrite `\b` into a Unicode-aware word boundary and `\w` into
 * a Unicode word character, so the keyword rules can be written naturally.
 *
 * Hebrew glues one- or two-letter prefixes (ה ב ל מ ו ש כ) onto the word
 * ("המזגן" = "the AC"), so the left boundary also accepts such a prefix.
 */

const WORD = "[\\p{L}\\p{N}_]";
const HEBREW_PREFIX = "[\\u05D1\\u05D4\\u05DB\\u05DC\\u05DE\\u05E9\\u05D5]{1,2}";
const LEFT = `(?:(?<!${WORD})|(?<=(?<!${WORD})${HEBREW_PREFIX}))(?=${WORD})`;
const RIGHT = `(?<=${WORD})(?!${WORD})`;
const BOUNDARY = `(?:${LEFT}|${RIGHT})`;

export function unicodeWordRegex(source: string, flags = "iu"): RegExp {
  const converted = source.replace(/\\b/g, BOUNDARY).replace(/\\w/g, WORD);
  return new RegExp(converted, flags.includes("u") ? flags : `${flags}u`);
}

/** Same, for a regex literal: `U(/\bκάρτα\b/i)`. */
export const U = (re: RegExp): RegExp => unicodeWordRegex(re.source, re.flags);
