import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/context/data-context";
import { Nav } from "@/components/nav";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trade Ledger",
  description: "Track open and closed option contracts with monthly P&L",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <DataProvider>
            <Nav />
            <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
