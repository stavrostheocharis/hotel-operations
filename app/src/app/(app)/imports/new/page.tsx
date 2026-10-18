import { stat } from "node:fs/promises";
import { Suspense } from "react";

import { requireViewer } from "@/auth/viewer";
import { PageHeader } from "@/components/console/page-header";
import { FolderImportButton } from "@/components/imports/batch-tools";
import { UploadForm } from "@/components/imports/upload-form";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { demoFolder } from "@/db/scripts/lib/paths";
import { t } from "@/i18n";

export const metadata = { title: t("imports.newImport") };

/** Step one of the wizard: the exports, as delivered. */
export default function NewImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={[{ label: t("imports.title"), href: "/imports" }, { label: t("imports.newImport") }]} title={t("imports.newImport")} description={t("imports.newQuestion")} />
      <Suspense fallback={<Skeleton className="h-72 max-w-2xl rounded-card" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const viewer = await requireViewer();
  if (!viewer.can("imports.run")) return <p className="text-body text-muted-foreground">{t("common.notAllowed")}</p>;
  const demo = demoFolder();
  const hasDemo = demo
    ? await stat(demo)
        .then((s) => s.isDirectory())
        .catch(() => false)
    : false;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <UploadForm />
      {hasDemo && demo ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-title-sm text-foreground">{t("imports.folderTitle")}</p>
              <p className="text-body text-muted-foreground">{t("imports.folderHint")}</p>
            </div>
            <FolderImportButton dir={demo} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
