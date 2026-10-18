import { UsersIcon } from "lucide-react";
import { Suspense } from "react";

import { ROLE_ORDER } from "@/auth/permissions";
import { requireViewer } from "@/auth/viewer";
import { EmptyState } from "@/components/console/empty-state";
import { PageHeader } from "@/components/console/page-header";
import { PageSkeleton } from "@/components/console/page-skeleton";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { AddUserDialog, UserMenu } from "@/components/settings/user-tools";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDateTime } from "@/console/format";
import { listUsers } from "@/console/settings";
import { getAppDb, schema } from "@/db";
import { label, t } from "@/i18n";

export const metadata = { title: t("settings.tabs.users") };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<PageSkeleton variant="table" />}>
        <Users />
      </Suspense>
    </div>
  );
}

async function Users() {
  const viewer = await requireViewer();
  const users = await listUsers(getAppDb(), viewer.scoped, viewer.property.id);
  const tz = viewer.property.timezone;
  const canManage = viewer.can("settings.users");
  const roles = ROLE_ORDER.filter((r) => viewer.can("settings.users", { targetRole: r })).map((r) => ({ value: r, label: label("user.role", r) }));
  const departments = schema.department.enumValues.map((d) => ({ value: d, label: label("user.department", d) }));
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.users.lead")} actions={canManage ? <AddUserDialog roles={roles} departments={departments} /> : null} />
      <SettingsTabs active="users" />
      {users.length === 0 ? (
        <EmptyState icon={<UsersIcon />} title={t("settings.users.empty")} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.users.columns.name")}</TableHead>
                  <TableHead>{t("settings.users.columns.role")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("settings.users.columns.department")}</TableHead>
                  <TableHead>{t("settings.users.columns.access")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("settings.users.columns.lastSignIn")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const editable = canManage && viewer.can("settings.users", { targetRole: u.role });
                  return (
                    <TableRow key={u.id} className={u.isActive ? undefined : "text-muted-foreground"}>
                      <TableCell>
                        <div className="text-body-strong text-foreground">
                          {u.name}
                          {u.isActive ? null : (
                            <Badge variant="secondary" className="ml-2">
                              {t("settings.users.inactive")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-caption text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell className="text-body">{label("user.role", u.propertyRole ?? u.role)}</TableCell>
                      <TableCell className="hidden text-body md:table-cell">{u.department ? label("user.department", u.department) : "–"}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "group_admin" ? "outline" : u.member ? "success" : "secondary"}>{u.role === "group_admin" ? t("settings.users.access.group") : u.member ? t("settings.users.access.yes") : t("settings.users.access.no")}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-caption text-muted-foreground md:table-cell">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt, tz) : t("settings.users.never")}</TableCell>
                      <TableCell className="text-right">{editable ? <UserMenu user={u} roles={roles} departments={departments} canGrant={canManage} /> : null}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {canManage && viewer.roleAt() !== "group_admin" ? <p className="text-caption text-muted-foreground">{t("settings.users.readonlyNote")}</p> : null}
    </>
  );
}
