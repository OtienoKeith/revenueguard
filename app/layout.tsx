import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://revenueguard.otienomkeith.workers.dev"),
  title: "RevenueGuard — Payment webhook replay",
  description: "Replay duplicate payment webhooks and verify that exactly one order is created.",
  openGraph: {
    title: "RevenueGuard — Payment webhook replay",
    description: "One payment. Twenty webhooks. One order.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "RevenueGuard payment webhook replay" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RevenueGuard — Payment webhook replay",
    description: "One payment. Twenty webhooks. One order.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
