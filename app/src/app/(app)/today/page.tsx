import { SectionPlaceholder } from "@/components/console/section-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("today.title") };

export default function Page() {
  return <SectionPlaceholder titleKey="today.title" questionKey="today.question" step={3} />;
}
