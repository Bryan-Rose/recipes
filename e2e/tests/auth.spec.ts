import { expect } from '@playwright/test'

import { ADMIN, COOK, apiAs, signIn, test, unique } from './helpers'

test('signed-out visitors get the login page, with password and SSO options', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Mock IdP' })).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('a wrong password is rejected', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill(COOK.username)
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await expect(page.getByText('Wrong username or password.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden()
})

test('sign in, see the recipes, sign out', async ({ page }) => {
  await page.goto('/')
  await signIn(page, COOK)

  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()
  await expect(page.getByText(COOK.fullName)).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  // The session is gone server-side, not just hidden: a reload stays signed out.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('a failed sign out says so and can be retried', async ({ page }) => {
  await page.goto('/')
  await signIn(page, COOK)

  // A flag rather than { times: 1 }: with that, the /auth/me refetch after the 503 once hung in CI.
  let fail = true
  await page.route('**/api/auth/logout', (route) =>
    fail ? route.fulfill({ status: 503, json: { detail: 'Server unavailable' } }) : route.continue(),
  )
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText(/Couldn’t sign out/)).toBeVisible()
  fail = false

  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('opening /logout directly signs nobody out, before or after signing in', async ({ page }) => {
  await page.goto('/logout')
  await signIn(page, COOK)
  await expect(page).toHaveURL('/')

  await page.goto('/logout')
  await expect(page).toHaveURL('/')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('a deep link opens straight to its page after signing in', async ({ page }) => {
  await page.goto('/recipes/new')
  await signIn(page, COOK)

  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible()
})

test('repeated wrong passwords lock the account for a while', async ({ page, baseURL }) => {
  // A throwaway user, so the lockout can't affect other tests.
  const admin = await apiAs(baseURL!, ADMIN)
  const user = { username: `locked-${unique()}`, password: 'first-password' }
  expect((await admin.post('/api/users/', { data: { ...user, full_name: 'Locked Out' } })).status()).toBe(201)
  for (let i = 0; i < 10; i++) {
    const response = await page.request.post('/api/auth/login', { data: { ...user, password: 'wrong-password' } })
    expect(response.status()).toBe(401)
  }

  // Even the right password is refused now.
  await page.goto('/')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await expect(page.getByText('Too many failed sign-in attempts. Try again later.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden()
})

test('a session revoked elsewhere sends the browser back to login', async ({ page, baseURL }) => {
  // A throwaway user, so changing its password can't affect other tests.
  const admin = await apiAs(baseURL!, ADMIN)
  const user = { username: `revoke-${unique()}`, password: 'first-password' }
  expect((await admin.post('/api/users/', { data: { ...user, full_name: 'Revoke Me' } })).status()).toBe(201)

  await page.goto('/')
  await signIn(page, user)

  // Changing the password from another session signs out every other session.
  const elsewhere = await apiAs(baseURL!, user)
  const change = await elsewhere.post('/api/auth/password', {
    data: { current_password: user.password, new_password: 'second-password' },
  })
  expect(change.status()).toBe(204)

  await page.getByRole('link', { name: 'Recipes' }).first().click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('too many logins from one address are refused at the proxy, others still get in', async ({ page }) => {
  // A documentation address via X-Forwarded-For (trusted from the private e2e network), so other tests keep their quota.
  const flooder = { 'X-Forwarded-For': '203.0.113.7' }
  // The burst of 30 in frontend/nginx.conf, plus the request that starts it.
  const allowed = 31
  const statuses: number[] = []
  for (let i = 0; i <= allowed; i++) {
    const response = await page.request.post('/api/auth/login', {
      headers: flooder,
      data: { username: `nobody-${unique()}`, password: 'wrong-password' },
    })
    statuses.push(response.status())
  }
  expect(statuses.slice(0, allowed)).toEqual(Array(allowed).fill(401))
  expect(statuses[allowed]).toBe(429)

  // The login page shows the proxy's message, even for the right password.
  await page.setExtraHTTPHeaders(flooder)
  await page.goto('/')
  await page.getByLabel('Username').fill(COOK.username)
  await page.getByLabel('Password').fill(COOK.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Too many sign-in attempts. Try again later.')).toBeVisible()

  // Another address isn't affected.
  const other = await page.request.post('/api/auth/login', { headers: { 'X-Forwarded-For': '203.0.113.8' }, data: COOK })
  expect(other.status()).toBe(204)
})
