"use client";

import { useActionState, useEffect, useRef } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addIssueNoteAction, type ActionResult } from "@/console/issue-actions";
import { t } from "@/i18n";

/** The note composer at the top of the Activity tab. */
export function NoteForm({ issueId }: { issueId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addIssueNoteAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="issueId" value={issueId} />
      <Textarea name="text" rows={2} placeholder={t("issue.activity.placeholder")} required />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("issue.activity.add")}
        </Button>
      </div>
    </form>
  );
}
