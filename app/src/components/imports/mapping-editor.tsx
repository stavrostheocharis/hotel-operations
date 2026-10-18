"use client";

import { useActionState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateMappingAction } from "@/console/import-actions";
import type { ActionResult } from "@/console/issue-actions";
import { t } from "@/i18n";

export type EditableFile = {
  path: string;
  datasetLabel: string;
  columns: string[];
  /** field → { label, column, required } in display order */
  fields: { field: string; label: string; column: string | null; required: boolean }[];
};

/** One select per field and file; Save remembers the choice for the property. */
export function MappingEditor({ batchId, files }: { batchId: string; files: EditableFile[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateMappingAction, null);
  useActionToast(state);
  if (!files.length) return null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="batchId" value={batchId} />
      <Card>
        <CardHeader>
          <CardTitle>{t("imports.mappingEditor.title")}</CardTitle>
          <p className="text-body text-muted-foreground">{t("imports.mappingEditor.lead")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <fieldset disabled={pending} className="contents">
            {files.map((f) => (
              <div key={f.path} className="flex flex-col gap-3">
                <p className="text-body-strong text-foreground">
                  {f.datasetLabel} <span className="text-caption font-normal text-muted-foreground">· {f.path}</span>
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {f.fields.map((x) => {
                    const id = `map__${f.path}__${x.field}`;
                    return (
                      <label key={x.field} htmlFor={id} className="flex flex-col gap-1 text-caption text-muted-foreground">
                        <span>
                          {x.label}
                          {x.required ? <span className="text-critical"> · {t("imports.mappingEditor.required")}</span> : null}
                        </span>
                        <select id={id} name={id} defaultValue={x.column ?? ""} className="h-10 w-full rounded-md border border-border bg-background px-3 text-body text-foreground focus-visible:shadow-focus focus-visible:outline-none">
                          <option value="">{t("imports.mappingEditor.notMapped")}</option>
                          {f.columns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("imports.mappingEditor.save")}
        </Button>
      </div>
    </form>
  );
}
