"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/console/issue-actions";
import { requestFeature } from "@/console/placeholders";
import { useActionToast } from "./use-action-toast";

/** One click, one event, one toast. */
export function RequestFeatureButton({ feature, text }: { feature: string; text: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(requestFeature, null);
  useActionToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="feature" value={feature} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {text}
      </Button>
    </form>
  );
}
