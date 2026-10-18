import Link from "next/link";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** "Showing 1–25 of 212" with previous / next; pages live in the URL. */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const last = Math.ceil(total / pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-caption text-muted-foreground">
      <span>{t("exceptions.pager", { from, to, total: total.toLocaleString("en-GB") })}</span>
      {last > 1 ? (
        <div className="flex gap-2">
          {page > 1 ? (
            <Button variant="ghost" aria-label={t("common.previous")} render={<Link href={href(page - 1)} />}>
              ←
            </Button>
          ) : null}
          <span className="self-center tabular-nums">
            {page} / {last}
          </span>
          {page < last ? (
            <Button variant="ghost" aria-label={t("common.next")} render={<Link href={href(page + 1)} />}>
              →
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
