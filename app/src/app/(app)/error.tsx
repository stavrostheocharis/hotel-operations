"use client";

import { useEffect } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/console/empty-state";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Something threw while a screen rendered: say so inside the shell, offer a retry and Today. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      title={t("errors.title")}
      body={t("errors.body")}
      action={
        <div className="flex gap-2">
          <Button onClick={reset}>{t("errors.retry")}</Button>
          <Button variant="secondary" render={<Link href="/today" />}>
            {t("errors.today")}
          </Button>
        </div>
      }
    />
  );
}
