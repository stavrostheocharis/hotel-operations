import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export type Crumb = { label: string; href?: string };

/**
 * Every screen starts the same way: optional breadcrumb, the title (display
 * size) with an optional status badge and the one primary action on the
 * right, then one sentence saying what the screen answers.
 */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  crumbs,
}: {
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
}) {
  return (
    <header className="flex flex-col gap-2">
      {crumbs?.length ? (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                <BreadcrumbItem>
                  {c.href ? <BreadcrumbLink render={<Link href={c.href} />}>{c.label}</BreadcrumbLink> : <BreadcrumbPage>{c.label}</BreadcrumbPage>}
                </BreadcrumbItem>
                {i < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display text-foreground">{title}</h1>
          {badge}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div> : null}
      </div>
      {description ? <p className="max-w-3xl text-body text-muted-foreground">{description}</p> : null}
    </header>
  );
}
