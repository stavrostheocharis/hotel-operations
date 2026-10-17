import { SectionPlaceholder } from "@/components/console/section-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("review.title") };

export default function Page() {
  return <SectionPlaceholder titleKey="review.title" questionKey="review.question" step={4} />;
}
