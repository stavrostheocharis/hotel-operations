import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { fmtHours, fmtNum, fmtPct, label } from "./markdown";
import type { AuditReport } from "./types";

/**
 * The one place a model writes prose in the audit: a summary and five
 * highlights for the GM, from the computed figures only. The facts are
 * handed over as a compact JSON; the model may not add numbers that are
 * not in it. Recorded with model and prompt version in the report.
 */
export const NARRATIVE_PROMPT_VERSION = "audit-narrative-v1";

export type Narrative = { summary: string; highlights: string[] };

export interface Narrator {
  readonly model: string;
  narrate(report: AuditReport): Promise<Narrative>;
}

const schema = z.object({
  summary: z.string().describe("Three to five sentences for the general manager, at most 180 words, plain English, no bullet points."),
  highlights: z.array(z.string()).min(3).max(6).describe("Three to six findings, each one sentence under 30 words, each carrying a number from the facts."),
});

const SYSTEM = `You write the summary of a hotel's season audit for its general manager.
Rules:
- Use only the facts given. Do not invent numbers, places, or causes. Every number you use must appear in the facts.
- Never name or characterise a person or a role's performance; the audit is about places, plant and practice, not staff.
- Plain English, short sentences, no marketing tone, no headings, no bullet points in the summary.
- Lead with what came back and what it reached (rooms, guests), then whether fixes held, then what guests wrote that never became a ticket, then the single most useful change in record-keeping.`;

export function createOpenAiNarrator(opts: { apiKey?: string; model?: string } = {}): Narrator {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const modelId = opts.model ?? process.env.OPENAI_MODEL_REASONING ?? "gpt-5.5";
  const openai = createOpenAI({ apiKey });
  return {
    model: modelId,
    async narrate(report) {
      const { object } = await generateObject({
        model: openai(modelId),
        schema,
        system: SYSTEM,
        prompt: `Facts (JSON):\n${JSON.stringify(facts(report))}`,
        providerOptions: { openai: { reasoningEffort: "medium", textVerbosity: "low" } },
      });
      return object;
    },
  };
}

/** Deterministic prose from the same facts, for tests and offline runs. */
export function createFakeNarrator(): Narrator {
  return {
    model: "fake",
    async narrate(r) {
      const top = r.recurring[0];
      const summary = [
        `${r.volume.issuesRecurring} of ${r.volume.issues} issues found in the ${r.season.label} came back at the same place.`,
        top ? `The largest was ${top.title}: ${top.episodes} episodes, ${top.reopens} reopens, ${top.roomsAffected} rooms, ${top.guestReports} guest reports.` : "",
        `${fmtPct(r.baseline.held30Share)} of ${r.baseline.closures} closed tickets held for 30 days; repeats ran at ${fmtNum(r.baseline.repeatsPerThousandRoomNights, 2)} per 1,000 occupied room-nights.`,
        r.guestVoice.silent[0]
          ? `Guests wrote about ${label(r.guestVoice.silent[0].topic)} ${r.guestVoice.silent[0].mentions} times and it reached a ticket ${r.guestVoice.silent[0].withTicket} times.`
          : "",
        r.records.recommendations[0] ? `First change to records: ${r.records.recommendations[0]}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const highlights = [
        `Median time to closure moved from ${fmtHours(r.timeToResolve.firstHalf.medianHours)} in the first half of the season to ${fmtHours(r.timeToResolve.secondHalf.medianHours)} in the second.`,
        `${r.fixesHeld.total.back30} of ${r.fixesHeld.total.closures} closures saw the same problem again within 30 days.`,
        `${r.winterWorks.length} items on the winter-works list, led by ${r.winterWorks[0]?.title ?? "nothing"}.`,
      ];
      return { summary, highlights };
    },
  };
}

export async function addNarrative(report: AuditReport, narrator: Narrator): Promise<AuditReport> {
  const n = await narrator.narrate(report);
  return { ...report, narrative: { model: narrator.model, promptVersion: NARRATIVE_PROMPT_VERSION, ...n } };
}

/** The subset of the report the model sees: enough to write from, small enough to stay cheap. */
function facts(r: AuditReport) {
  return {
    property: r.property.name,
    season: r.season,
    volume: { records: r.volume.signalsTotal, bySource: r.volume.bySource, issues: r.volume.issues, recurring: r.volume.issuesRecurring, byLocationKind: r.volume.byLocationKind },
    baseline: r.baseline,
    topRecurring: r.recurring.slice(0, 10).map((f) => ({
      issue: f.title,
      where: f.locationCode,
      kind: f.locationKind,
      episodes: f.episodes,
      reopens: f.reopens,
      closures: f.closures,
      repeatTickets: f.repeatTickets,
      roomsAffected: f.roomsAffected,
      guestReports: f.guestReports,
      first: f.firstAt.slice(0, 10),
      last: f.lastAt.slice(0, 10),
    })),
    fixesHeld: { total: r.fixesHeld.total, byCategory: r.fixesHeld.byCategory.slice(0, 6) },
    timeToResolve: { firstHalf: r.timeToResolve.firstHalf, secondHalf: r.timeToResolve.secondHalf, slowestCategories: r.timeToResolve.byCategory.slice(0, 4) },
    guestVoice: { bySource: r.guestVoice.bySource, silent: r.guestVoice.silent.map((s) => ({ topic: s.topic, mentions: s.mentions, withTicket: s.withTicket })), surveys: r.guestVoice.surveys },
    winterWorksTop5: r.winterWorks.slice(0, 5).map((w) => ({ rank: w.rank, issue: w.title, evidence: w.evidence })),
    records: { weakOrPoor: r.records.metrics.filter((m) => m.verdict === "weak" || m.verdict === "poor").map((m) => ({ measure: m.label, share: m.share, count: m.count, verdict: m.verdict })), recommendations: r.records.recommendations },
  };
}
