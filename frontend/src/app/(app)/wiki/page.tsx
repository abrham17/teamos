import { MarkdownWorkspace } from "@/components/wiki-v2/MarkdownWorkspace";
import { Suspense } from "react";

export default function WikiPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[var(--text-muted)]">Loading workspace...</div>}>
      <MarkdownWorkspace />
    </Suspense>
  );
}
