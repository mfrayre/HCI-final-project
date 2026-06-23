import type { Metadata } from "next";
import "./globals.css";
import { Providers } from './providers';
import ConditionalNavbar from '@/components/ConditionalNavbar';

export const metadata: Metadata = {
  title: "DartActuallyWorks",
  description: "Plan your Dartmouth degree with ease",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className="bg-white">
        <Providers>
          <ConditionalNavbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}

