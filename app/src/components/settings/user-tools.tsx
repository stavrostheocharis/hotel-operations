"use client";

import { ChevronDownIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/console/issue-actions";
import { addUserAction, resetPasswordAction, setAccessAction, setActiveAction, updateUserAction } from "@/console/settings-actions";
import type { UserRow } from "@/console/settings";
import { t } from "@/i18n";

export type Option = { value: string; label: string };

/** "Add user": name, email, role, department, the initial password. */
export function AddUserDialog({ roles, departments }: { roles: Option[]; departments: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addUserAction, null);
  const [role, setRole] = useState(roles.find((r) => r.value === "staff")?.value ?? roles[0]?.value ?? "staff");
  const [department, setDepartment] = useState("none");
  useActionToast(state, () => setOpen(false));
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("settings.users.add")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.users.add")}</DialogTitle>
            <DialogDescription>{t("settings.users.addDescription")}</DialogDescription>
          </DialogHeader>
          <form action={action} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-name">{t("settings.users.name")}</Label>
              <Input id="new-name" name="name" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-email">{t("settings.users.email")}</Label>
              <Input id="new-email" name="email" type="email" required />
            </div>
            <RoleFields roles={roles} departments={departments} role={role} setRole={setRole} department={department} setDepartment={setDepartment} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">{t("settings.users.password")}</Label>
              <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={10} required />
              <p className="text-caption text-muted-foreground">{t("settings.users.passwordHint")}</p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>{t("common.cancel")}</DialogClose>
              <Button type="submit" disabled={pending}>
                {t("settings.users.add")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleFields({ roles, departments, role, setRole, department, setDepartment }: { roles: Option[]; departments: Option[]; role: string; setRole: (v: string) => void; department: string; setDepartment: (v: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label>{t("settings.users.role")}</Label>
        <input type="hidden" name="role" value={role} />
        <Select value={role} onValueChange={(v) => setRole(String(v))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("settings.users.department")}</Label>
        <input type="hidden" name="department" value={department} />
        <Select value={department} onValueChange={(v) => setDepartment(String(v))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("settings.users.noDepartment")}</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

type Kind = "role" | "password" | null;

/** The row menu: change role, reset password, access here, deactivate. */
export function UserMenu({ user, roles, departments, canGrant }: { user: UserRow; roles: Option[]; departments: Option[]; canGrant: boolean }) {
  const [open, setOpen] = useState<Kind>(null);
  const [role, setRole] = useState<string>(user.role);
  const [department, setDepartment] = useState<string>(user.department ?? "none");
  const [roleState, roleAction, rolePending] = useActionState<ActionResult | null, FormData>(updateUserAction, null);
  const [pwState, pwAction, pwPending] = useActionState<ActionResult | null, FormData>(resetPasswordAction, null);
  const [accessState, accessAction] = useActionState<ActionResult | null, FormData>(setAccessAction, null);
  const [activeState, activeAction] = useActionState<ActionResult | null, FormData>(setActiveAction, null);
  useActionToast(roleState, () => setOpen(null));
  useActionToast(pwState, () => setOpen(null));
  useActionToast(accessState);
  useActionToast(activeState);
  const groupWide = user.role === "group_admin";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" />}>
          {t("settings.users.more")}
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setOpen("role")}>{t("settings.users.changeRole")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen("password")}>{t("settings.users.resetPassword")}</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {groupWide ? null : (
              <DropdownMenuItem
                disabled={!canGrant}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("userId", user.id);
                  fd.set("grant", user.member ? "0" : "1");
                  accessAction(fd);
                }}
              >
                {user.member ? t("settings.users.removeAccess") : t("settings.users.giveAccess")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                const fd = new FormData();
                fd.set("userId", user.id);
                fd.set("active", user.isActive ? "0" : "1");
                activeAction(fd);
              }}
            >
              {user.isActive ? t("settings.users.deactivate") : t("settings.users.reactivate")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "role"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.users.changeRole").replace(/…$/, "")}</DialogTitle>
            <DialogDescription>{user.name}</DialogDescription>
          </DialogHeader>
          <form action={roleAction} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={user.id} />
            <RoleFields roles={roles} departments={departments} role={role} setRole={setRole} department={department} setDepartment={setDepartment} />
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>{t("common.cancel")}</DialogClose>
              <Button type="submit" disabled={rolePending}>
                {t("settings.users.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "password"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.users.resetPassword").replace(/…$/, "")}</DialogTitle>
            <DialogDescription>{user.name}</DialogDescription>
          </DialogHeader>
          <form action={pwAction} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={user.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`pw-${user.id}`}>{t("settings.users.newPassword")}</Label>
              <Input id={`pw-${user.id}`} name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus />
              <p className="text-caption text-muted-foreground">{t("settings.users.passwordHint")}</p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>{t("common.cancel")}</DialogClose>
              <Button type="submit" disabled={pwPending}>
                {t("settings.users.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
