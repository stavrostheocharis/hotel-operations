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
  /** running with no heartbeat for 30 s: the worker is gone. */
  stalled: boolean;
};

export const STALL_MS = 30_000;
