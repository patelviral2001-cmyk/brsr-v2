"use client";

import { FileCard } from "./file-card";
import type { FileObject } from "@/types";

export function FileGrid({ files }: { files: FileObject[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {files.map((f) => <FileCard key={f.id} file={f} />)}
    </div>
  );
}
