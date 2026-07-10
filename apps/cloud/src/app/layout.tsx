import type { ReactNode } from "react";

export const metadata = {
  title: "LocaleCI — Ship your app in 30 languages, without leaving Git",
  description:
    "Open-source CLI + GitHub Action that translates your i18n files with LLMs on every commit — with a per-string quality score you can audit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
