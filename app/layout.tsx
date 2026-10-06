import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Color_Emoji } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600"], display: "swap", variable: "--font-sans" });
// Windows has no flag emoji; this fallback only downloads the glyph ranges a page uses.
const emoji = Noto_Color_Emoji({ subsets: ["emoji"], weight: "400", display: "swap", preload: false, variable: "--font-emoji" });

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
      <body className={`${figtree.variable} ${emoji.variable}`}>{children}</body>
    </html>
  );
}
