"use server";

import { requireViewer } from "@/auth/viewer";
import { getAppDb, schema, withTenant } from "@/db";
import { t } from "@/i18n";
import type { ActionResult } from "./issue-actions";

/** "Tell us you want this early": one event per click, with the person as actor. */
export async function requestFeature(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const feature = String(formData.get("feature") ?? "");
  if (!["copilot", "guestQr"].includes(feature)) return { ok: false, message: "unknown feature", at: Date.now() };
  const viewer = await requireViewer();
  await withTenant(getAppDb(), viewer.scoped, (tx) =>
    tx.insert(schema.events).values({
      groupId: viewer.scoped.groupId,
      propertyId: viewer.property.id,
      entityType: "property",
      entityId: viewer.property.id,
      type: "feature.requested",
      actor: viewer.user.id,
      payload: { feature },
    }),
  );
  return { ok: true, message: t("placeholder.requested"), at: Date.now() };
}
