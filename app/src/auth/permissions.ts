import type { schema } from "@/db";

export type Role = (typeof schema.userRole.enumValues)[number];
export type Department = (typeof schema.department.enumValues)[number];

/**
 * What a role may do. Checked in every server action and route handler
 * (`assertCan`) and mirrored in the UI (`viewer.can`), so a hidden button is
 * never the only thing standing between a person and a write.
 *
 * Effective role at a property = the membership's override, else the user's
 * role. `readonly` sees every screen and gets no forms.
 */
export type Capability =
  | "issue.assign"
  | "issue.status"
  | "issue.note"
  | "issue.edit"
  | "issue.verify"
  | "verification.schedule"
  | "verification.complete"
  | "signals.review"
  | "links.decide"
  | "imports.run"
  | "jobs.run"
  | "settings.property"
  | "settings.locations"
  | "settings.users";

/** Context for the capabilities that depend on whose thing it is. */
export type CapabilityContext = {
  /** Department of the issue / task in question. */
  department?: Department | null;
  /** Owner of the issue, or assignee of the task. */
  ownerUserId?: string | null;
  /** For settings.users: the role being granted or edited. */
  targetRole?: Role | null;
};

export type Actor = {
  userId: string;
  role: Role;
  department: Department | null;
};

const MANAGERS: Role[] = ["group_admin", "gm"];
const SUPERVISORS: Role[] = ["group_admin", "gm", "dept_head", "supervisor"];

export function can(actor: Actor, cap: Capability, ctx: CapabilityContext = {}): boolean {
  const { role } = actor;
  if (role === "readonly") return false;
  const manager = MANAGERS.includes(role);
  const supervisor = SUPERVISORS.includes(role);
  const sameDepartment = ctx.department == null || actor.department == null || ctx.department === actor.department;
  const own = ctx.ownerUserId != null && ctx.ownerUserId === actor.userId;

  switch (cap) {
    case "issue.assign":
      return manager || (supervisor && (ctx.ownerUserId == null || sameDepartment));
    case "issue.status":
      return manager || (supervisor && sameDepartment) || (role === "staff" && own);
    case "issue.note":
      return true;
    case "issue.edit":
      return supervisor;
    case "issue.verify":
    case "verification.complete":
      return supervisor || (role === "staff" && own);
    case "verification.schedule":
    case "signals.review":
    case "links.decide":
      return supervisor;
    case "imports.run":
    case "jobs.run":
    case "settings.property":
      return manager;
    case "settings.locations":
      return manager || (role === "dept_head" && actor.department === "engineering");
    case "settings.users":
      if (role === "group_admin") return true;
      return role === "gm" && ctx.targetRole !== "group_admin";
  }
}

export class AuthorizationError extends Error {
  readonly capability: Capability;
  constructor(cap: Capability) {
    super(`not allowed: ${cap}`);
    this.name = "AuthorizationError";
    this.capability = cap;
  }
}

export function assertCan(actor: Actor, cap: Capability, ctx?: CapabilityContext): void {
  if (!can(actor, cap, ctx)) throw new AuthorizationError(cap);
}

export const ROLE_ORDER: Role[] = ["group_admin", "gm", "dept_head", "supervisor", "staff", "readonly"];
