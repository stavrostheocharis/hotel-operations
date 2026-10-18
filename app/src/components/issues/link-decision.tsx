"use client";

import { useActionState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { decideLink } from "@/console/actions";
import type { ActionResult } from "@/console/issue-actions";
import { t } from "@/i18n";

/** Confirm / "Not this issue" on one evidence record: pending state and one toast. */
export function LinkDecision({ issueId, signalId }: { issueId: string; signalId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(decideLink, null);
  useActionToast(state);
  return (
    <form action={action} className="ml-auto flex gap-2">
      <input type="hidden" name="issueId" value={issueId} />
      <input type="hidden" name="signalId" value={signalId} />
      <Button type="submit" name="decision" value="confirm" variant="ghost" disabled={pending}>
        {t("issue.confirm")}
      </Button>
      <Button type="submit" name="decision" value="reject" variant="ghost" disabled={pending}>
        {t("issue.reject")}
      </Button>
    </form>
  );
}
