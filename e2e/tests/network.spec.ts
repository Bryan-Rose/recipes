import { expect, request } from '@playwright/test'

import { test } from './helpers'

// compose.e2e.yml's RECIPES_ALLOWED_SUBNETS leaves out 192.0.2.0/24 (a documentation range).
test('a client outside the allowed subnets gets 403 for the app and the API', async ({ baseURL }) => {
  const outside = await request.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': '192.0.2.5' } })

  for (const path of ['/', '/api/auth/config']) {
    expect((await outside.get(path)).status(), path).toBe(403)
  }
})

test('a client inside them is served', async ({ request }) => {
  expect((await request.get('/api/auth/config')).status()).toBe(200)
})
