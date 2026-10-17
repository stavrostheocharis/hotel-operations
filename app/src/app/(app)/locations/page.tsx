import { SectionPlaceholder } from "@/components/console/section-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("locations.title") };

export default function Page() {
  return <SectionPlaceholder titleKey="locations.title" questionKey="locations.question" step={5} />;
}
