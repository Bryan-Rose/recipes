import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './server'

// A request with no handler is a test bug. MSW's 'error' mode only rejects that
// one fetch, which the app's error handling can swallow, so record unhandled
// requests and fail the test explicitly.
const unhandled: string[] = []

beforeAll(() => {
  server.events.on('request:unhandled', ({ request }) => {
    unhandled.push(`${request.method} ${new URL(request.url).pathname}`)
  })
  server.listen({ onUnhandledFrame: 'error' })
})
afterEach(() => {
  server.resetHandlers()
  cleanup()
  const requests = unhandled.splice(0)
  if (requests.length > 0) throw new Error(`Unhandled API requests (add an MSW handler): ${requests.join(', ')}`)
})
afterAll(() => server.close())
