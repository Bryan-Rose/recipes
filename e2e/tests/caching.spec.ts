import { expect } from '@playwright/test'

import { COOK, apiAs, test, unique } from './helpers'

test('the SPA shell is revalidated on every load, so a deploy never strands old asset links', async ({ request }) => {
  for (const path of ['/', '/index.html', '/recipes/1']) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    expect(response.headers()['cache-control'], path).toBe('no-cache')
  }
})

// Passed before the no-cache fix too: it guards the other half of the strategy,
// since immutable assets are only safe while the shell is revalidated.
test('hashed assets are cached forever', async ({ page, request }) => {
  await page.goto('/')
  const script = await page.locator('script[src^="/assets/"]').first().getAttribute('src')
  expect(script, 'no hashed script in index.html').toBeTruthy()
  const response = await request.get(script as string)
  expect(response.headers()['cache-control']).toContain('immutable')
})

test('the recipe list and assets are sent compressed', async ({ page, baseURL }) => {
  const api = await apiAs(baseURL!, COOK)
  // Non-empty, so the list is over nginx's minimum length for compressing.
  expect((await api.post('/api/recipes/', { data: { name: `Gzip ${unique()}` } })).status()).toBe(201)
  const list = await api.get('/api/recipes/', { headers: { 'Accept-Encoding': 'gzip' } })
  expect(list.headers()['content-encoding']).toBe('gzip')
  expect(list.headers()['vary']).toContain('Accept-Encoding')
  await api.dispose()

  await page.goto('/')
  const script = await page.locator('script[src^="/assets/"]').first().getAttribute('src')
  const asset = await page.request.get(script as string, { headers: { 'Accept-Encoding': 'gzip' } })
  expect(asset.headers()['content-encoding']).toBe('gzip')
})
