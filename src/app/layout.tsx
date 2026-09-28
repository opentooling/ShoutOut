import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { getThemePreference } from "@/lib/theme-server";
import { themeAttribute } from "@/lib/theme";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ShoutOut", template: "%s · ShoutOut" },
  description: "Recognise the people who make work better.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff8ec" },
    { media: "(prefers-color-scheme: dark)", color: "#1a2336" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = themeAttribute(await getThemePreference());
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
