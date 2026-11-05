import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Student Viva Portal | VivaDesk',
  description: 'Pooled 30-minute slot booking powered by PostgreSQL SKIP LOCKED',
};

export default function PortalPage() {
  return <section aria-label="Student Viva Portal" />;
}
