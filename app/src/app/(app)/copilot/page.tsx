import { PhasePlaceholder } from "@/components/console/phase-placeholder";
import { t } from "@/i18n";

export const metadata = { title: t("copilot.title") };

export default function Page() {
  return <PhasePlaceholder section="copilot" />;
}
