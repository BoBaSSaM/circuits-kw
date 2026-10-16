"use client";

import dynamic from "next/dynamic";

function StorefrontLoading() {
  return (
    <main className="storefront-boot" role="status" aria-live="polite">
      <div className="storefront-boot-card">
        <span className="storefront-boot-mark" aria-hidden="true">CK</span>
        <span>
          <strong className="storefront-boot-brand">Circuits KW</strong>
          <span className="storefront-boot-copy">Loading the storefront…</span>
        </span>
        <span className="storefront-boot-spinner" aria-hidden="true" />
      </div>
    </main>
  );
}

const Storefront = dynamic(() => import("../../App"), {
  ssr: false,
  loading: StorefrontLoading,
});

export default function StorefrontPage() {
  return <Storefront />;
}
