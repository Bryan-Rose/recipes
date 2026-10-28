import { expect, test } from '@playwright/test'

test('the SPA shell is revalidated on every load, so a deploy never strands old asset links', async ({ request }) => {
  for (const path of ['/', '/index.html', '/recipes/1']) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    expect(response.headers()['cache-control'], path).toBe('no-cache')
  }
})

test('hashed assets are cached forever', async ({ page, request }) => {
  await page.goto('/')
  const script = await page.locator('script[src^="/assets/"]').first().getAttribute('src')
  const response = await request.get(script!)
  expect(response.headers()['cache-control']).toContain('immutable')
})
