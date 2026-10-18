import { SearchXIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/console/empty-state";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** A stale link, a deleted record: inside the shell, in the dictionary's words. */
export default function NotFound() {
  return <EmptyState icon={<SearchXIcon />} title={t("notFound.title")} body={t("notFound.body")} action={<Button variant="secondary" render={<Link href="/today" />}>{t("errors.today")}</Button>} />;
}
