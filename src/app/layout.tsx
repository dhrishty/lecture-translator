import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lecture — Korean to English",
  description: "An ephemeral lecture workspace. View slides, follow Korean lectures in English, and copy your notes before leaving.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen flex flex-col">{children}</body></html>;
}
