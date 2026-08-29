import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KANTIRA Business OS",
  description: "Internal business management platform for KANTIRA.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicons/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicons/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/brand/favicons/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: ["/brand/favicons/favicon-192.png"],
    apple: [{ url: "/brand/favicons/favicon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1B3D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen font-sans text-kantira-navy-900 antialiased">
        {children}
      </body>
    </html>
  );
}
