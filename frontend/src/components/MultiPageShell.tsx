'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import VivaDeskWorkspace, { PageRoute } from '@/components/VivaDeskWorkspace';

const VALID_ROUTES: PageRoute[] = [
  'cockpit',
  'calendar',
  'statistics',
  'command',
  'portal',
  'admin',
  'examiner-slots',
  'examiner-analytics',
];

export default function MultiPageShell({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const segment = (pathname?.split('/').filter(Boolean)[0] || 'cockpit') as PageRoute;
  const activeRoute: PageRoute = VALID_ROUTES.includes(segment) ? segment : 'cockpit';

  return (
    <>
      <VivaDeskWorkspace
        activeRoute={activeRoute}
        onRouteNavigate={(nextPage) => router.push(`/${nextPage}`)}
      />
      <div className="sr-only">{children}</div>
    </>
  );
}
