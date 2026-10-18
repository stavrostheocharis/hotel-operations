import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { en } from "../src/i18n/en";

/**
 * Every string a person reads comes from src/i18n/en.ts. This walks the
 * screens and components and reports JSX text, string children and the
 * attributes people read (placeholder, title, aria-label, alt) that hold
 * letters but are not a `t(…)` / `label(…)` call. shadcn's ui/ folder and
 * the design reference page are not product copy.
 *
 *   pnpm check:i18n            # lists the hits, exit 1 if any
 */
const ROOTS = ["src/app", "src/components"];
const SKIP = [path.join("src", "components", "ui"), path.join("src", "app", "(app)", "design")];
const READ_ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label", "description"]);
const LETTERS = /\p{L}/u;

type Hit = { file: string; line: number; text: string };
const hits: Hit[] = [];

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (SKIP.some((s) => p.startsWith(s))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
}

function check(file: string) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report = (node: ts.Node, text: string) => {
    const t = text.replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim();
    if (!LETTERS.test(t)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    hits.push({ file, line: line + 1, text: t.length > 60 ? `${t.slice(0, 57)}…` : t });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text);
    else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const e = node.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) report(e, e.text);
      else if (ts.isTemplateExpression(e)) report(e, [e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join(" "));
    } else if (ts.isJsxAttribute(node) && node.initializer && READ_ATTRS.has(node.name.getText(sf))) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) report(init, init.text);
      else if (ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) report(init.expression, init.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const files: string[] = [];
for (const r of ROOTS) walk(r, files);
for (const f of files) check(f);

// --- the other direction: every dictionary leaf must be read somewhere ------------------
// `t("a.b")`, `tList("a.b")`, `label("group", x)` (the whole group), and
// template keys t(`a.b.${x}`) (the whole prefix) count as uses.
function leaves(node: unknown, prefix: string, out: string[]) {
  if (typeof node === "string" || Array.isArray(node)) out.push(prefix);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
}
function walkAll(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walkAll(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
}
const sources: string[] = [];
walkAll("src", sources);
const used = new Set<string>();
// The phase placeholders read their whole section by name (`${section}.${leaf}`).
const prefixes = new Set<string>(["copilot", "guestQr"]);
for (const f of sources) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/\b(?:t|tList)\(\s*"([^"]+)"/g)) used.add(m[1]);
  for (const m of text.matchAll(/\b(?:label|dictLabel)\(\s*"([^"]+)"/g)) prefixes.add(m[1]);
  for (const m of text.matchAll(/\b(?:t|tList|label)\(\s*`([^`$]+)\$\{/g)) prefixes.add(m[1].replace(/\.$/, ""));
  for (const m of text.matchAll(/`\$\{[^}]+\}\.([a-zA-Z]+)` as TKey/g)) prefixes.add(`*.${m[1]}`);
}
const all: string[] = [];
leaves(en, "", all);
const unused = all.filter((k) => {
  if (used.has(k)) return false;
  for (const p of prefixes) {
    if (p.startsWith("*.")) {
      if (k.endsWith(p.slice(1))) return false;
    } else if (k === p || k.startsWith(`${p}.`)) return false;
  }
  return true;
});
if (unused.length) {
  for (const k of unused) console.log(`unused key: ${k}`);
  console.log(`\n${unused.length} dictionary key(s) nothing reads`);
}

if (hits.length || unused.length) {
  for (const h of hits) console.log(`${h.file}:${h.line}  ${JSON.stringify(h.text)}`);
  console.log(`\n${hits.length} string(s) outside the dictionary in ${new Set(hits.map((h) => h.file)).size} file(s)`);
  process.exit(1);
}
console.log(`i18n: ${files.length} files, every string comes from the dictionary and every key is read`);
