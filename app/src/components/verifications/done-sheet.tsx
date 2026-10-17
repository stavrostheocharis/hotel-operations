"use client";

import { useActionState, useState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { dateInputValue } from "@/components/issues/workflow-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/console/issue-actions";
import { completeVerificationAction, skipVerificationAction } from "@/console/verification-actions";
import { t } from "@/i18n";

/**
 * The done form, in a side sheet: held (staff or guest), came back, or
 * could not check (then a new date). Posts to the completion action; one
 * toast; the page refreshes behind it.
 */
export function DoneSheet({ taskId, issueTitle, place, canSkip, trigger }: { taskId: string; issueTitle: string; place: string; canSkip: boolean; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("staff_evidence");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(completeVerificationAction, null);
  const [skipState, skipAction, skipping] = useActionState<ActionResult | null, FormData>(skipVerificationAction, null);
  useActionToast(state, () => setOpen(false));
  useActionToast(skipState, () => setOpen(false));
  const [today] = useState(() => dateInputValue(new Date()));
  const [tomorrow] = useState(() => dateInputValue(new Date(Date.now() + 86_400_000)));
  const needsNote = result === "recurred" || result === "could_not";
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger ?? <Button variant="secondary" />}>{t("verifications.done")}</SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-6 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("verifications.sheet.title")}</SheetTitle>
          <SheetDescription>{t("verifications.sheet.description", { issue: issueTitle, place })}</SheetDescription>
        </SheetHeader>
        <form id={`done-${taskId}`} action={action} className="flex flex-1 flex-col gap-5">
          <input type="hidden" name="taskId" value={taskId} />
          <RadioGroup name="result" value={result} onValueChange={(v) => setResult(String(v))} className="gap-3">
            {[
              ["staff_evidence", t("verifications.sheet.held")],
              ["guest_confirmed", t("verifications.sheet.guest")],
              ["recurred", t("verifications.sheet.back")],
              ["could_not", t("verifications.sheet.couldNot")],
            ].map(([value, text]) => (
              <label key={value} className="flex items-center gap-3 text-body text-foreground">
                <RadioGroupItem value={value} />
                {text}
              </label>
            ))}
          </RadioGroup>
          {result === "could_not" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`resched-${taskId}`}>{t("verifications.dialog.dueOn")}</Label>
              <Input id={`resched-${taskId}`} name="rescheduleTo" type="date" defaultValue={tomorrow} min={today} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`observed-${taskId}`}>{t("verifications.sheet.checkedOn")}</Label>
              <Input id={`observed-${taskId}`} name="observedAt" type="date" defaultValue={today} max={today} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${taskId}`}>
              {t("verifications.sheet.note")}
              {needsNote ? null : <span className="ml-1 text-caption font-normal text-muted-foreground">({t("issue.dialog.optional")})</span>}
            </Label>
            <Textarea id={`note-${taskId}`} name="note" rows={4} required={needsNote} />
          </div>
        </form>
        <SheetFooter className="flex-row justify-between gap-2">
          {canSkip ? (
            <form action={skipAction}>
              <input type="hidden" name="taskId" value={taskId} />
              <Button type="submit" variant="ghost" disabled={skipping}>
                {t("verifications.skip")}
              </Button>
            </form>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <SheetClose render={<Button variant="ghost" type="button" />}>{t("issue.dialog.cancel")}</SheetClose>
            <Button type="submit" form={`done-${taskId}`} disabled={pending}>
              {pending ? t("verifications.sheet.saving") : t("verifications.sheet.save")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
