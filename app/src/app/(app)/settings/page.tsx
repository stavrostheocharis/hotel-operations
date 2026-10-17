import { SectionPlaceholder } from "@/components/console/section-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("settings.title") };

export default function Page() {
  return <SectionPlaceholder titleKey="settings.title" questionKey="settings.question" step={7} />;
}
