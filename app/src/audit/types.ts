/**
 * The season audit, as data. One object per property and season; the
 * markdown renderer, the page and the exports all read this shape. The
 * sections follow the seven deliverables in docs/discovery/04-audit-offer.md.
 *
 * Nothing in here names a person: no technician, no agent, no guest. The
 * offer promises "not by technician", and the report keeps it structurally.
 */
export const AUDIT_VERSION = "audit-v1";

export type SeasonWindow = {
  /** Inclusive, property-local calendar date. */
  from: string;
  /** Inclusive, property-local calendar date. */
  to: string;
  label: string;
};

export type Verdict = "good" | "weak" | "poor" | "info";

export type RecurringFailure = {
  issueId: string;
  title: string;
  topic: string | null;
  category: string | null;
  status: string;
  locationCode: string | null;
  locationKind: string | null;
  locationName: string | null;
  episodes: number;
  reopens: number;
  signals: number;
  tickets: number;
  closures: number;
  /** Tickets raised after the first closure: visits the first fix did not prevent. */
  repeatTickets: number;
  roomsAffected: number;
  guestReports: number;
  deskComplaints: number;
  surveyMentions: number;
  reviewMentions: number;
  firstAt: string;
  lastAt: string;
};

export type WinterWorksItem = RecurringFailure & {
  rank: number;
  /** recurrence × (1 + guest reports) × (1 + repeat tickets); see docs/audit.md. */
  priority: number;
  evidence: string;
};

export type HeldRow = { closures: number; back7: number; back30: number; back90: number };

export type AuditReport = {
  version: typeof AUDIT_VERSION;
  generatedAt: string;
  property: { code: string; name: string; timezone: string };
  season: SeasonWindow;

  volume: {
    signalsTotal: number;
    bySource: { source: string; count: number }[];
    byLanguage: { language: string; count: number }[];
    issues: number;
    issuesRecurring: number;
    byLocationKind: { kind: string; issues: number; recurring: number }[];
    roomNights: number;
  };

  baseline: {
    repeats: number;
    roomNights: number;
    repeatsPerThousandRoomNights: number | null;
    closures: number;
    held30: number;
    held30Share: number | null;
    issuesWithClosure: number;
    issuesReopened: number;
    reopenRate: number | null;
    medianHoursToResolve: number | null;
  };

  recurring: RecurringFailure[];

  fixesHeld: {
    total: HeldRow;
    byCategory: ({ category: string } & HeldRow)[];
    byMonth: ({ month: string } & HeldRow)[];
  };

  timeToResolve: {
    byCategory: { category: string; tickets: number; medianHours: number | null; p90Hours: number | null }[];
    byMonth: { month: string; tickets: number; medianHours: number | null; p90Hours: number | null }[];
    firstHalf: { tickets: number; medianHours: number | null };
    secondHalf: { tickets: number; medianHours: number | null };
  };

  guestVoice: {
    bySource: { source: string; withTopic: number; linked: number; withTicket: number }[];
    byTopic: {
      topic: string;
      category: string | null;
      mentions: number;
      linked: number;
      withTicket: number;
      /** Average of survey overall (1–10) and review score (normalised to 10) on the mentioning records. */
      avgScore: number | null;
    }[];
    /** Topics guests write about that rarely became a ticket. */
    silent: { topic: string; category: string | null; mentions: number; withTicket: number; examples: { source: string; date: string; text: string }[] }[];
    surveys: {
      withLinkedIssue: { responses: number; avgOverall: number | null; avgNps: number | null; recommendShare: number | null };
      others: { responses: number; avgOverall: number | null; avgNps: number | null; recommendShare: number | null };
    };
  };

  winterWorks: WinterWorksItem[];

  records: {
    metrics: { key: string; label: string; count: number; total: number; share: number | null; verdict: Verdict; note: string }[];
    recommendations: string[];
  };

  narrative?: {
    model: string;
    promptVersion: string;
    summary: string;
    highlights: string[];
  };
};
