"use server";

import { refresh } from "next/cache";
import { requireViewer } from "@/auth/viewer";
import { getAppDb } from "@/db";
import { t } from "@/i18n";
import type { ActionResult } from "./issue-actions";
import { addAlias, createLocation, mapSpelling, removeAlias, renameLocation, setServes } from "./location-admin";
import { failureMessage } from "./action-errors";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

async function run(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message, at: Date.now() };
  } catch (err) {
    return { ok: false, message: failureMessage(err), at: Date.now() };
  }
}

export async function addAliasAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await addAlias(getAppDb(), viewer.scoped, viewer.actor(), { locationId: str(fd, "locationId"), alias: str(fd, "alias") });
    return t("settings.locations.toast.aliasAdded", { alias: str(fd, "alias").trim() });
  });
}

export async function removeAliasAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await removeAlias(getAppDb(), viewer.scoped, viewer.actor(), { locationId: str(fd, "locationId"), alias: str(fd, "alias") });
    return t("settings.locations.toast.aliasRemoved");
  });
}

export async function setServesAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const ids = fd.getAll("servesId").map(String).filter(Boolean);
    const n = await setServes(getAppDb(), viewer.scoped, viewer.actor(), { equipmentId: str(fd, "equipmentId"), servesIds: ids });
    return t("settings.locations.toast.servesSet", { n });
  });
}

export async function mapSpellingAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    const res = await mapSpelling(getAppDb(), viewer.scoped, viewer.actor(), { spelling: str(fd, "spelling"), locationId: str(fd, "locationId") });
    return t("settings.locations.toast.mapped", { spelling: str(fd, "spelling").trim(), code: res.code, n: res.moved });
  });
}

export async function createLocationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await createLocation(getAppDb(), viewer.scoped, viewer.actor(), { kind: str(fd, "kind"), code: str(fd, "code"), name: str(fd, "name"), parentId: str(fd, "parentId") || null });
    return t("settings.locations.toast.created", { code: str(fd, "code").trim().toUpperCase() });
  });
}

export async function renameLocationAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer();
    await renameLocation(getAppDb(), viewer.scoped, viewer.actor(), { locationId: str(fd, "locationId"), name: str(fd, "name") });
    return t("settings.locations.toast.renamed");
  });
}
