import { SectionPlaceholder } from "@/components/console/section-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("verifications.title") };

export default function Page() {
  return <SectionPlaceholder titleKey="verifications.title" questionKey="verifications.question" step={3} />;
}
