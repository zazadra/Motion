'use client';

import dynamic from 'next/dynamic';

const DAppKitClientProvider = dynamic(
  () =>
    import('@/components/providers/DAppKitClientProvider').then(
      (m) => m.DAppKitClientProvider
    ),
  { ssr: false }
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <DAppKitClientProvider>{children}</DAppKitClientProvider>;
}
