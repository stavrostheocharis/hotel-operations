"use client";

import { useActionState, useState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { checkBatchAction, createFolderBatchAction, discardBatchAction, loadBatchAction, runJobAction } from "@/console/import-actions";
import type { ActionResult } from "@/console/issue-actions";
import { t } from "@/i18n";

/** The buttons of the wizard, each a form posting to one action. */
export function CheckButton({ batchId, again }: { batchId: string; again: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(checkBatchAction, null);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="batchId" value={batchId} />
      <Button type="submit" variant={again ? "secondary" : "default"} disabled={pending}>
        {pending ? t("imports.batch.checking") : again ? t("imports.batch.recheck") : t("imports.batch.check")}
      </Button>
    </form>
  );
}

export function LoadButton({ batchId, verdict, canOverride, modelAvailable }: { batchId: string; verdict: string | null; canOverride: boolean; modelAvailable: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(loadBatchAction, null);
  const [llm, setLlm] = useState(modelAvailable);
  useActionToast(state);
  const blocked = verdict === "stop" && !canOverride;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="batchId" value={batchId} />
      {modelAvailable ? (
        <label className="flex items-center gap-3 text-body text-foreground">
          <Switch name="llm" checked={llm} onCheckedChange={(v) => setLlm(Boolean(v))} />
          {t("imports.batch.useModel")}
        </label>
      ) : null}
      {verdict === "stop" ? <p className="text-caption text-critical">{t("imports.batch.stopNote")}</p> : verdict === "reshape" ? <p className="text-caption text-warning">{t("imports.batch.reshapeNote")}</p> : null}
      <div>
        <Button type="submit" disabled={pending || blocked}>
          {pending ? t("imports.batch.loading") : verdict === "go" ? t("imports.batch.load") : t("imports.batch.loadAnyway")}
        </Button>
      </div>
    </form>
  );
}

export function DiscardButton({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(discardBatchAction, null);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="batchId" value={batchId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {t("imports.batch.discard")}
      </Button>
    </form>
  );
}

export function FolderImportButton({ dir }: { dir: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createFolderBatchAction, null);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="dir" value={dir} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {t("imports.importFolder")}
      </Button>
    </form>
  );
}

export function RunJobButton({ kind, label: text, variant = "secondary" }: { kind: "link" | "normalize" | "embed"; label: string; variant?: "secondary" | "ghost" }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(runJobAction, null);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      <Button type="submit" variant={variant} disabled={pending}>
        {text}
      </Button>
    </form>
  );
}
