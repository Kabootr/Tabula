import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getQueryClient } from '../../lib/query-client';

/**
 * Wrap any React island that uses TanStack Query with this provider.
 * Because Astro hydrates islands independently, place this at the root
 * of each data-fetching island (e.g. <QueryProvider client:load>).
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}
