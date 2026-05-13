import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ConvexClientProvider } from "@/components/layout/ConvexClientProvider";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

const themeBootScript = `try{var t=localStorage.getItem('tm-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}`;

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Techmania Projekty",
  description: "Správa projektů technického oddělení Techmania Science Center",
  manifest: "/manifest.webmanifest",
  applicationName: "Techmania Projekty",
  appleWebApp: {
    capable: true,
    title: "TM Projekty",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900 font-sans dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
