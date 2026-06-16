import { QueryClient } from '@tanstack/react-query';

/**
 * One QueryClient per browser session. Created lazily so each React
 * island that needs data sharing can import the same instance.
 */
let client: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return client;
}
