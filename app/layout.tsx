import "./globals.css";
import type { Metadata } from "next";

import FilterResetOnEntry from "./_components/FilterResetOnEntry";

export const metadata: Metadata = {
  title: "游戏运营中台",
  description: "创作者与运营协作平台",
};

// 无闪烁注入主题:读取 localStorage,默认 dark。同步执行,需在 body 渲染前完成。
const THEME_BOOTSTRAP = `(() => {
  try {
    const t = localStorage.getItem('theme');
    const dark = t ? t === 'dark' : true;
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="font-sans" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <FilterResetOnEntry />
        {children}
      </body>
    </html>
  );
}
