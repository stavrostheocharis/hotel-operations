"use client";

import { PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog; "Save as PDF" there is the PDF export. */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <PrinterIcon aria-hidden />
      Print / PDF
    </Button>
  );
}
