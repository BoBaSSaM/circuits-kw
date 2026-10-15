import type { Metadata } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Component Preview Server",
  description: "Workspace component previews for the Circuits KW design canvas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
