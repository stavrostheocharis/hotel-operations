import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <div className="flex flex-col gap-2">
        <p className="text-caption-strong text-muted-foreground uppercase tracking-wide">
          SquareDev
        </p>
        <h1 className="text-display text-foreground">
          Operations Exception Manager
        </h1>
        <p className="text-body-lg max-w-xl text-muted-foreground">
          One issue history across guest complaints, work orders, reviews and
          SOPs, so the same service failure does not happen twice.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button render={<Link href="/design" />}>Open design system</Button>
        <Button variant="secondary" render={<Link href="/design#exceptions" />}>
          Sample exceptions list
        </Button>
      </div>
    </main>
  );
}
