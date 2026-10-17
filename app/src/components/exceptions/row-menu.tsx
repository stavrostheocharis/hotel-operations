"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AssignDialog, ScheduleDialog, type Option } from "@/components/issues/workflow-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AssignableUser } from "@/console/issue-detail";
import { t } from "@/i18n";

export type RowIssue = { id: string; title: string; status: string; category: string | null; severity: string; department: string | null; ownerUserId: string | null; ownerName: string | null };

/** The kebab at the end of a queue row: open, assign, schedule a check. */
export function RowMenu({ issue, users, departments, canAssign, canSchedule }: { issue: RowIssue; users: AssignableUser[]; departments: Option[]; canAssign: boolean; canSchedule: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"assign" | "schedule" | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("exceptions.row.menu", { title: issue.title })} />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push(`/issues/${issue.id}`)}>{t("exceptions.row.open")}</DropdownMenuItem>
            {canAssign ? <DropdownMenuItem onClick={() => setDialog("assign")}>{t("exceptions.row.assign")}</DropdownMenuItem> : null}
            {canSchedule ? <DropdownMenuItem onClick={() => setDialog("schedule")}>{t("exceptions.row.schedule")}</DropdownMenuItem> : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {canAssign ? <AssignDialog open={dialog === "assign"} onClose={() => setDialog(null)} issue={issue} users={users} departments={departments} /> : null}
      {canSchedule ? <ScheduleDialog open={dialog === "schedule"} onClose={() => setDialog(null)} issueId={issue.id} issueTitle={issue.title} users={users} defaultAssigneeId={issue.ownerUserId} /> : null}
    </>
  );
}
