import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VivaFlow — IITM ML Viva Suite',
  description:
    'Multi-page warm-obsidian ML Viva Cockpit, Schedule & Activity Bars Calendar, Cohort Analytics, and Live Meet Command Center.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0b0a09] text-stone-100">{children}</body>
    </html>
  );
}
