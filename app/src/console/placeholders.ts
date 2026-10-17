"use server";

import { requireViewer } from "@/auth/viewer";
import { getAppDb, schema, withTenant } from "@/db";

/** "Tell us you want this early": one event per click, with the person as actor. */
export async function requestFeature(formData: FormData): Promise<void> {
  const feature = String(formData.get("feature") ?? "");
  if (!["copilot", "guestQr"].includes(feature)) return;
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
}
