import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "./globals.css";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("gicko-theme");
    if (stored !== "light") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gicko",
  description: "Sleep and feeding tracker",
  manifest: "/manifest.webmanifest",
  // Installed to the iOS home screen it runs without Safari's chrome, which is also the
  // only way iOS delivers web push.
  // Not black-translucent: with viewport-fit=cover that draws the page under the clock,
  // so a scrolled list ends up behind the status bar. iOS reserves that strip instead and
  // tints it with the theme colour below.
  appleWebApp: { capable: true, title: "Gicko", statusBarStyle: "default" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Draws into the safe areas so env(safe-area-inset-*) reports the real insets — the
  // bottom nav uses that to stay clear of the iPhone home indicator.
  viewportFit: "cover" as const,
  // Keeps the status bar readable in both themes once installed.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
