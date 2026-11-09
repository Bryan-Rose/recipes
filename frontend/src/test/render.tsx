import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { createQueryClient } from '../queryClient'

/** Renders with the app's real QueryClient setup and a data router (as in main.tsx) at `route`. */
export function renderWithProviders(ui: ReactNode, { route = '/' }: { route?: string } = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [route] })} />
    </QueryClientProvider>,
  )
}
