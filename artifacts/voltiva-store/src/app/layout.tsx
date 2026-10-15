import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: "Circuits KW",
  description:
    "Electronics components, project kits, and build guidance for makers in Kuwait.",
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
