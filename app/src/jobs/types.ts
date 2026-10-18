import type { schema } from "@/db";

export type JobKind = (typeof schema.jobKind.enumValues)[number];
export type JobStatus = (typeof schema.jobStatus.enumValues)[number];

export type JobProgressInfo = { step: string; done: number; total: number; message?: string };

export type JobParams = {
  /** normalize: re-process everything; link: use embeddings / the model; import: the batch. */
  all?: boolean;
  llm?: boolean;
  embed?: boolean;
  batchId?: string;
  propertyCode?: string;
};

export type JobView = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  params: JobParams;
  progress: JobProgressInfo | null;
  log: { at: string; line: string }[];
  result: Record<string, unknown>;
  error: string | null;
  requestedBy: string | null;
  requestedByName: string | null;
  heartbeatAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  /** running with no heartbeat for STALL_MS: the worker is gone. */
  stalled: boolean;
  /** queued for NO_WORKER_MS: nothing is picking jobs up. */
  noWorker: boolean;
};

/** Shown as "stopped reporting" on the page: long enough for a big file to parse synchronously. */
export const STALL_MS = 120_000;
/** The worker's sweeper fails a running job after this long without a heartbeat. */
export const SWEEP_AFTER_MS = 10 * 60_000;
/** A job still queued after this long means no worker is running. */
export const NO_WORKER_MS = 2 * 60_000;
