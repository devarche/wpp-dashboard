import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WPP Dashboard",
  description: "WhatsApp Business Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#111b21] antialiased h-full">{children}</body>
    </html>
  );
}
