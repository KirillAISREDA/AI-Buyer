import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "AI-Buyer — Контроль закупок",
  description: "AI-система автоматического контроля цен закупок",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${geist.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
