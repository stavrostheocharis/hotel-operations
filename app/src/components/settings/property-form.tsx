"use client";

import { useActionState } from "react";

import { useActionToast } from "@/components/console/use-action-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/console/issue-actions";
import type { PropertyProfile } from "@/console/property-settings";
import { updatePropertyAction } from "@/console/settings-actions";
import { t } from "@/i18n";

/** Name, time zone, season, when the export is expected. One Save. */
export function PropertyForm({ profile, timezones }: { profile: PropertyProfile; timezones: string[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updatePropertyAction, null);
  useActionToast(state);
  return (
    <Card className="max-w-2xl">
      <CardContent>
        <form action={action} className="flex flex-col gap-5">
          <fieldset disabled={pending} className="contents">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("settings.property.name")} htmlFor="name">
                <Input id="name" name="name" defaultValue={profile.name} required />
              </Field>
              <Field label={t("settings.property.code")} htmlFor="code">
                <Input id="code" value={profile.code} readOnly className="text-muted-foreground" />
              </Field>
            </div>
            <Field label={t("settings.property.timezone")} htmlFor="timezone" hint={t("settings.property.timezoneHint")}>
              <Input id="timezone" name="timezone" list="timezones" defaultValue={profile.timezone} required />
              <datalist id="timezones">
                {timezones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("settings.property.seasonOpen")} htmlFor="seasonOpen" hint={t("settings.property.seasonHint")}>
                <Input id="seasonOpen" name="seasonOpen" type="date" defaultValue={profile.seasonOpen ?? ""} />
              </Field>
              <Field label={t("settings.property.seasonClose")} htmlFor="seasonClose">
                <Input id="seasonClose" name="seasonClose" type="date" defaultValue={profile.seasonClose ?? ""} />
              </Field>
            </div>
            <Field label={t("settings.property.importTime")} htmlFor="importTime" hint={t("settings.property.importTimeHint")}>
              <Input id="importTime" name="importTime" type="time" defaultValue={profile.settings.importTime ?? ""} className="w-40" />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {t("settings.property.save")}
              </Button>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
