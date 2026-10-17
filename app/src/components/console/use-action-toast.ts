"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/console/issue-actions";

/**
 * One toast per completed action: success closes the dialog, failure stays
 * on screen until dismissed. `at` makes a repeated identical result count as
 * a new one.
 */
export function useActionToast(state: ActionResult | null, onOk?: () => void) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!state || seen.current === state.at) return;
    seen.current = state.at;
    if (state.ok) {
      toast.success(state.message);
      onOk?.();
    } else {
      toast.error(state.message, { duration: Infinity, closeButton: true });
    }
  }, [state, onOk]);
}
