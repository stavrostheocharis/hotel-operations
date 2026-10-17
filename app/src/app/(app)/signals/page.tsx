import { SectionPlaceholder } from "@/components/console/section-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("signals.title") };

export default function Page() {
  return <SectionPlaceholder titleKey="signals.title" questionKey="signals.question" step={4} />;
}
