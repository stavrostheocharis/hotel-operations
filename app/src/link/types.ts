import type { schema } from "@/db";

export type SignalSource = (typeof schema.signalSource.enumValues)[number];
export type LocationKind = (typeof schema.locationKind.enumValues)[number];

/** A signal as the linker sees it: normalised, located, with the bits of the raw row that matter. */
export type LinkSignal = {
  id: string;
  source: SignalSource;
  externalId: string;
  occurredAt: Date;
  locationCode: string | null;
  locationKind: LocationKind | null;
  /** Building letter the location belongs to (room, floor, building or equipment), else null. */
  building: string | null;
  topic: string | null;
  category: string | null;
  stayRef: string | null;
  /** English text when available, else the original. */
  text: string | null;
  /** Work-order facts from the raw row. */
  wo: {
    createdAt: Date;
    closedAt: Date | null;
    status: string;
    reopened: string | null;
    closureNote: string | null;
    technician: string | null;
  } | null;
  /** For surveys: when the stay they describe began. */
  stayCheckIn: Date | null;
};

export type LinkMethod = (typeof schema.linkMethod.enumValues)[number];

export type CandidatePair = {
  a: string;
  b: string;
  score: number;
  rule: string;
  method: LinkMethod;
  evidence: Record<string, unknown>;
};

/** The live channels: evidence from these counts as "it happened again". */
export const LIVE_SOURCES: SignalSource[] = ["front_desk", "work_order", "staff_report", "guest_qr", "compensation"];

/** Sources whose single, unlinked record still deserves an issue of its own. */
export const ACTIONABLE_SOURCES: SignalSource[] = ["work_order", "front_desk", "staff_report", "guest_qr"];
