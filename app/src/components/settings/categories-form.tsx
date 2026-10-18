"use client";

import { useActionState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/console/issue-actions";
import { updateCategoriesAction } from "@/console/settings-actions";
import { t } from "@/i18n";

export type CategoryRowInput = { category: string; label: string; windowDays: number; department: string | null };

/** One row per category: the window in days and the default department; one Save for all. */
export function CategoriesForm({ rows, departments }: { rows: CategoryRowInput[]; departments: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateCategoriesAction, null);
  useActionToast(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-0">
          <fieldset disabled={pending} className="contents">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.categories.columns.category")}</TableHead>
                  <TableHead className="w-48">{t("settings.categories.columns.window")}</TableHead>
                  <TableHead className="w-56">{t("settings.categories.columns.department")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell className="text-body text-foreground">{r.label}</TableCell>
                    <TableCell>
                      <Input name={`window_${r.category}`} type="number" min={1} max={365} defaultValue={r.windowDays} className="w-24 tabular-nums" aria-label={`${r.label}: ${t("settings.categories.columns.window")}`} />
                    </TableCell>
                    <TableCell>
                      <select name={`dept_${r.category}`} defaultValue={r.department ?? "none"} aria-label={`${r.label}: ${t("settings.categories.columns.department")}`} className="h-9 w-full rounded-input border border-border bg-background px-3 text-body text-foreground focus-visible:shadow-focus focus-visible:outline-none">
                        <option value="none">{t("settings.categories.noDepartment")}</option>
                        {departments.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </fieldset>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {t("settings.categories.save")}
        </Button>
      </div>
    </form>
  );
}
