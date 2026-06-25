import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "sub2api upstream status",
  description: "Public read-only upstream account usage panel for sub2api"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
