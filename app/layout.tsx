import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "아무위키",
    template: "%s - 아무위키",
  },
  description: "아무거나 기록하고 문맥 안에서 탐색하는 개인 위키",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#121614" },
  ],
};

const appearanceScript = `
(() => {
  try {
    const value = JSON.parse(localStorage.getItem("amuwiki:appearance") || "null");
    const root = document.documentElement;
    if (value?.theme) root.dataset.theme = value.theme;
    if (value?.font) root.dataset.font = value.font;
    if (value?.fontScale) root.dataset.scale = value.fontScale;
    if (value?.contentWidth) root.dataset.width = value.contentWidth;
    if (value?.mode && value.mode !== "system") root.dataset.mode = value.mode;
  } catch {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="ko"
      data-theme="paper-green"
      data-font="pretendard"
      data-scale="normal"
      data-width="normal"
      suppressHydrationWarning
    >
      <body>
        {children}
        <Script
          id="amuwiki-appearance"
          strategy="beforeInteractive"
        >
          {appearanceScript}
        </Script>
      </body>
    </html>
  );
}
