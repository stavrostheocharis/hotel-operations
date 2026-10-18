"use client";

import { UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/i18n";

/** The drop zone: pick the exports, send them to the upload route, land on the batch page. */
export function UploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!files.length) {
      toast.error(t("imports.upload.none"));
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/imports/upload", { method: "POST", body: fd });
      const body = (await res.json()) as { batchId?: string; error?: string };
      if (!res.ok || !body.batchId) {
        toast.error(body.error ?? res.statusText, { duration: Infinity, closeButton: true });
        return;
      }
      router.push(`/imports/${body.batchId}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-title-sm text-foreground">{t("imports.upload.title")}</p>
          <p className="text-body text-muted-foreground">{t("imports.upload.hint")}</p>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-8 text-center hover:bg-surface-hover">
          <UploadIcon className="size-6 text-muted-foreground" />
          <span className="text-body text-foreground">{files.length ? files.map((f) => f.name).join(", ") : t("imports.upload.choose")}</span>
          <input type="file" multiple accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.json,.jsonl,.ndjson,.pdf,.docx" className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={busy || !files.length}>
            {busy ? t("imports.upload.uploading") : t("imports.upload.start")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
