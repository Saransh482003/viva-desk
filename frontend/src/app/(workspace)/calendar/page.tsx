import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Viva Schedule & Activity Bars | VivaDesk',
  description: 'Monthly viva calendar with embedded completion & capacity bars',
};

export default function CalendarPage() {
  return <section aria-label="Viva Schedule & Activity Bars" />;
}
