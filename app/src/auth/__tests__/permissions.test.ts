import { describe, expect, it } from "vitest";
import { assertCan, AuthorizationError, can, type Actor, type Department, type Role } from "../permissions";

const admin: Actor = { userId: "u-admin", role: "group_admin", department: "management" };
const gm: Actor = { userId: "u-gm", role: "gm", department: "management" };
const engineer: Actor = { userId: "u-eng", role: "dept_head", department: "engineering" };
const housekeeping: Actor = { userId: "u-hk", role: "dept_head", department: "housekeeping" };
const supervisor: Actor = { userId: "u-sup", role: "supervisor", department: "front_office" };
const staff: Actor = { userId: "u-staff", role: "staff", department: "engineering" };
const readonly: Actor = { userId: "u-ro", role: "readonly", department: null };

describe("permissions", () => {
  it("readonly can do nothing, managers can do everything operational", () => {
    for (const cap of ["issue.assign", "issue.note", "imports.run", "settings.users"] as const) {
      expect(can(readonly, cap)).toBe(false);
      expect(can(admin, cap)).toBe(true);
    }
    expect(can(gm, "settings.users", { targetRole: "group_admin" })).toBe(false);
    expect(can(gm, "settings.users", { targetRole: "gm" })).toBe(true);
  });

  it("department heads act inside their department", () => {
    expect(can(engineer, "issue.assign", { department: "engineering" })).toBe(true);
    expect(can(engineer, "issue.assign", { department: null })).toBe(true);
    expect(can(engineer, "issue.status", { department: "housekeeping" })).toBe(false);
    expect(can(housekeeping, "issue.status", { department: "housekeeping" })).toBe(true);
    expect(can(engineer, "settings.locations")).toBe(true);
    expect(can(housekeeping, "settings.locations")).toBe(false);
    expect(can(engineer, "imports.run")).toBe(false);
  });

  it("supervisors review and decide, staff only touch their own", () => {
    expect(can(supervisor, "links.decide")).toBe(true);
    expect(can(supervisor, "verification.schedule")).toBe(true);
    expect(can(staff, "links.decide")).toBe(false);
    expect(can(staff, "issue.note")).toBe(true);
    expect(can(staff, "issue.status", { ownerUserId: "u-staff" })).toBe(true);
    expect(can(staff, "issue.status", { ownerUserId: "u-other" })).toBe(false);
    expect(can(staff, "verification.complete", { ownerUserId: "u-staff" })).toBe(true);
    expect(can(staff, "issue.assign")).toBe(false);
  });

  it("assertCan throws a typed error", () => {
    expect(() => assertCan(readonly, "issue.note")).toThrow(AuthorizationError);
    expect(() => assertCan(gm, "issue.note")).not.toThrow();
  });
});

describe("the capabilities added for the pilot", () => {
  const a = (role: Role, department: Department | null = null): Actor => ({ userId: "u", role, department });
  it("gate the settings and imports screens, the stop override and the placeholder button", () => {
    expect(can(a("gm"), "settings.view")).toBe(true);
    expect(can(a("dept_head", "engineering"), "settings.view")).toBe(true);
    expect(can(a("dept_head", "housekeeping"), "settings.view")).toBe(false);
    expect(can(a("gm"), "users.view")).toBe(true);
    expect(can(a("dept_head", "engineering"), "users.view")).toBe(false);
    expect(can(a("gm"), "imports.view")).toBe(true);
    expect(can(a("supervisor"), "imports.view")).toBe(false);
    expect(can(a("gm"), "imports.override")).toBe(false);
    expect(can(a("group_admin"), "imports.override")).toBe(true);
    expect(can(a("staff"), "feature.request")).toBe(true);
    expect(can(a("readonly"), "feature.request")).toBe(false);
  });
});
