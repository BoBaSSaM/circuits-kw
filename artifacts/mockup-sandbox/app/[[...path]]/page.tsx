"use client";

import dynamic from "next/dynamic";

const PreviewApp = dynamic(() => import("../../src/App"), { ssr: false });

export default function PreviewPage() {
  return <PreviewApp />;
}
