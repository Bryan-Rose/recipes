import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'

import { authKeys } from './api/auth'
import { ApiError } from './api/client'

import './index.css'
import App from './App.tsx'

// Any 401 means the session expired or was revoked: mark the user signed out
// so App swaps in the login page.
function handleUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.status === 401) queryClient.setQueryData(authKeys.me, null)
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthorized }),
  mutationCache: new MutationCache({ onError: handleUnauthorized }),
  defaultOptions: {
    queries: {
      // A 404 or a validation error will never succeed on retry; only retry
      // once, and only for the transient case.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof Error && error.name === 'ApiError'),
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
