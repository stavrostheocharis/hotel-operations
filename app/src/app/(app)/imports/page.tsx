import { SectionPlaceholder } from "@/components/console/section-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("imports.title") };

export default function Page() {
  return <SectionPlaceholder titleKey="imports.title" questionKey="imports.question" step={6} />;
}
