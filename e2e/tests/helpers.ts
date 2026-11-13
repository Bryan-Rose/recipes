import { test as base, expect, request, type APIRequestContext, type Page } from '@playwright/test'

// Seeded by `make e2e` before the tests run (scripts/create_user.py --password-stdin).
export const COOK = { username: 'cook', password: 'cook-password', fullName: 'Home Cook' }
export const ADMIN = { username: 'admin', password: 'admin-password', fullName: 'Admin' }

/**
 * A made-up client address (the 198.18.0.0/15 benchmarking range), which nginx trusts from the
 * private e2e network: each test signs in from its own, so the suite's many sign-ins stay under
 * the per-address login limit in frontend/nginx.conf.
 */
const clientAddress = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`

export const test = base.extend({
  extraHTTPHeaders: async ({}, use) => use({ 'X-Forwarded-For': clientAddress() }),
})

/** A suffix that keeps names unique across tests sharing one database. */
export const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

export async function signIn(page: Page, user: { username: string; password: string }) {
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  // exact: the SSO button is "Sign in with …".
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

/** An API client signed in as `user`, talking to the app the same way the browser does. */
export async function apiAs(baseURL: string, user: { username: string; password: string }): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() } })
  const response = await api.post('/api/auth/login', { data: user })
  expect(response.status()).toBe(204)
  return api
}

// A 2×1 PNG: the browser converts it to the JPEGs the API stores.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=', 'base64')

/** The image has loaded, so the authenticated GET through nginx served a real picture. */
export async function expectLoaded(image: ReturnType<Page['locator']>) {
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
}
