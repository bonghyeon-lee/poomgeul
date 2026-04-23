import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "poomgeul (품글) — 공개 텍스트를 위한 번역 플랫폼",
  description:
    "공개 텍스트를 위한 오픈소스 번역 플랫폼. 원문은 위키처럼, 번역본은 깃허브처럼.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
