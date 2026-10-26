import { expect, request, type APIRequestContext, type Page } from '@playwright/test'

// Seeded by `make e2e` before the tests run (scripts/create_user.py --password-stdin).
export const COOK = { username: 'cook', password: 'cook-password', fullName: 'Home Cook' }
export const ADMIN = { username: 'admin', password: 'admin-password', fullName: 'Admin' }

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
  const api = await request.newContext({ baseURL })
  const response = await api.post('/api/auth/login', { data: user })
  expect(response.status()).toBe(204)
  return api
}
