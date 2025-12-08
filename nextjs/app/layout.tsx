import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NFT Marketplace",
  description: "Buy and sell NFTs in a decentralized marketplace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="nextjs-app antialiased">{children}</body>
    </html>
  );
}
