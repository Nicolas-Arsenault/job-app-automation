import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./components/Nav";
import { MobileNav } from "./components/MobileNav";
import { ThemeProvider, ThemeToggle, themeInitScript } from "./components/ThemeProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Roleo — Job Search Copilot",
  description: "A friendly, focused job discovery and application workspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <div className="app-shell flex min-h-screen">
            <aside className="app-sidebar sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-y-auto border-r border-slate-200/80 bg-white/95 px-4 py-5 backdrop-blur-xl md:flex dark:border-slate-800 dark:bg-slate-950/95">
              <div className="mb-7 flex items-center gap-3 px-2">
                <div className="brand-mark" aria-hidden="true">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M7.5 20.5c2.8 1.7 5.4 2.3 8.1 1.8 4.6-.9 6.7-5 7-10.8-4.9-.8-8.9.1-11.7 2.6-1.8 1.6-3 3.7-3.4 6.4Z" fill="currentColor" opacity=".2" />
                    <path d="M6 24.8c4.2-2.3 8.2-5.5 12.1-9.7M9.1 13.5c-1.6-1.4-3.4-2.4-5.6-2.9.1 4.4 1.7 7.5 4.8 9.4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12.3 25.4c3.1.5 6-.2 8.3-2.2 3-2.5 4.3-6.5 3.9-12-4.5-.8-8.2 0-11 2.3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="text-xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">roleo</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">job search copilot</div>
                </div>
              </div>
              <Nav />
              <div className="mt-auto border-t border-slate-100 pt-3 dark:border-slate-800">
                <ThemeToggle />
              </div>
            </aside>
            <div className="min-w-0 flex-1">
              <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-950/90">
                <div className="flex items-center gap-2.5">
                  <div className="brand-mark brand-mark-small" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none">
                      <path d="M7.5 20.5c2.8 1.7 5.4 2.3 8.1 1.8 4.6-.9 6.7-5 7-10.8-4.9-.8-8.9.1-11.7 2.6-1.8 1.6-3 3.7-3.4 6.4Z" fill="currentColor" opacity=".2" />
                      <path d="M6 24.8c4.2-2.3 8.2-5.5 12.1-9.7M9.1 13.5c-1.6-1.4-3.4-2.4-5.6-2.9.1 4.4 1.7 7.5 4.8 9.4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12.3 25.4c3.1.5 6-.2 8.3-2.2 3-2.5 4.3-6.5 3.9-12-4.5-.8-8.2 0-11 2.3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-lg font-black tracking-[-0.04em]">roleo</span>
                </div>
                <ThemeToggle compact />
              </header>
              <main className="relative overflow-x-hidden px-4 py-6 pb-24 sm:px-6 md:px-8 md:py-8 xl:px-10">
                <div className="page-glow page-glow-one" aria-hidden="true" />
                <div className="page-glow page-glow-two" aria-hidden="true" />
                <div className="relative mx-auto max-w-[1440px]">{children}</div>
              </main>
              <MobileNav />
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
