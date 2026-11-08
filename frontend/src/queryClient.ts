import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { authKeys } from './api/auth'
import { ApiError } from './api/client'

/** The app's QueryClient; tests build theirs here too so they get the same 401 handling. */
export function createQueryClient(): QueryClient {
  // Any 401 means the session expired or was revoked: mark the user signed out
  // so App swaps in the login page.
  function handleUnauthorized(error: unknown) {
    if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(authKeys.me, null)
  }

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleUnauthorized }),
    mutationCache: new MutationCache({
      onError: handleUnauthorized,
      // A handful of users and a small dataset: refetching whatever is on screen after any change,
      // even a failed one, is cheap and spares tracking what each mutation touches. Awaited, so a
      // mutation resolves only once the screen's data is fresh.
      onSettled: (): Promise<void> => queryClient.invalidateQueries(),
    }),
    defaultOptions: {
      queries: {
        // A 404 or a validation error will never succeed on retry; only retry
        // once, and only for the transient case.
        retry: (failureCount, error) => failureCount < 1 && !(error instanceof Error && error.name === 'ApiError'),
        refetchOnWindowFocus: false,
      },
    },
  })
  return queryClient
}
