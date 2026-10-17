import { ConstructionIcon } from "lucide-react";

import { t, type TKey } from "@/i18n";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/**
 * A section that exists on the map but has not been built yet: its title,
 * the question it will answer, and which build step brings it. Honest, so
 * the shape of the app can be understood before every screen is real.
 */
export function SectionPlaceholder({ titleKey, questionKey, step }: { titleKey: TKey; questionKey: TKey; step: number }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t(titleKey)} description={t(questionKey)} />
      <EmptyState icon={<ConstructionIcon />} title={t("common.arrivesIn", { step })} body={t(questionKey)} />
    </div>
  );
}
