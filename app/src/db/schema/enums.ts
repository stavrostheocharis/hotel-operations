import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "group_admin",
  "gm",
  "dept_head",
  "supervisor",
  "staff",
  "readonly",
]);

export const department = pgEnum("department", [
  "front_office",
  "housekeeping",
  "engineering",
  "fb",
  "guest_relations",
  "spa",
  "it",
  "management",
]);

export const locationKind = pgEnum("location_kind", [
  "property",
  "building",
  "floor",
  "room",
  "facility",
  "equipment",
]);

export const signalSource = pgEnum("signal_source", [
  "work_order",
  "front_desk",
  "survey",
  "review",
  "staff_report",
  "guest_qr",
  "pms",
  "compensation",
]);

export const locationMethod = pgEnum("location_method", [
  "exact",
  "alias",
  "inferred",
  "stay",
  "llm",
  "human",
  "none",
]);

export const issueSeverity = pgEnum("issue_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const issueStatus = pgEnum("issue_status", [
  "detected",
  "assigned",
  "resolved",
  "verified",
  "reopened",
  "closed_unverified",
]);

export const issueSignalRole = pgEnum("issue_signal_role", [
  "primary",
  "supporting",
  "duplicate",
]);

export const linkMethod = pgEnum("link_method", [
  "rule",
  "embedding",
  "llm",
  "human",
]);

export const actionKind = pgEnum("action_kind", [
  "ticket_created",
  "escalated",
  "guest_gesture",
  "inspection",
  "sop_applied",
  "note",
]);

export const outcomeKind = pgEnum("outcome_kind", [
  "guest_confirmed",
  "staff_evidence",
  "no_recurrence",
  "recurred",
]);

export const suggestionKind = pgEnum("suggestion_kind", [
  "link",
  "classify",
  "locate",
  "summarize",
  "next_action",
]);

export const suggestionDecision = pgEnum("suggestion_decision", [
  "pending",
  "accepted",
  "rejected",
]);
