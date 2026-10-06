import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are self-hosted so builds never depend on reaching Google Fonts.
const figtree = localFont({
  src: "./fonts/figtree-latin-wght.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-sans",
});
const figtreeExtended = localFont({
  src: "./fonts/figtree-latin-ext-wght.woff2",
  weight: "300 900",
  display: "swap",
  preload: false,
  variable: "--font-sans-ext",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+20A0-20AB, U+20AD-20C0, U+2C60-2C7F, U+A720-A7FF" }],
});
// Windows has no flag emoji. This file holds only the flag glyphs and is
// downloaded only when a page shows a flag.
const flags = localFont({
  src: "./fonts/noto-color-emoji-flags.woff2",
  display: "swap",
  preload: false,
  variable: "--font-emoji",
  declarations: [{ prop: "unicode-range", value: "U+1F1E6-1F1FF" }],
});

export const metadata: Metadata = {
  title: "LeadFlow",
  description: "Your LinkedIn lead work, clearly organized.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Runs before first paint so a saved dark theme never flashes light.
const themeScript = `try{var t=localStorage.getItem("leadflow-theme")||"system";var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${figtree.variable} ${figtreeExtended.variable} ${flags.variable}`}>{children}</body>
    </html>
  );
}
