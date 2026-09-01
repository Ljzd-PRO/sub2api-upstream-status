import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "sub2api upstream status",
  description: "Public read-only upstream account usage panel for sub2api"
};

const themeBootstrap = `(() => {
  try {
    const stored = localStorage.getItem("sub2api-upstream-status.theme");
    const choice = stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
    const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = choice === "auto" ? (systemDark ? "dark" : "light") : choice;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
