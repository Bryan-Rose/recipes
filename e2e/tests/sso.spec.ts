import { expect, test, type Page } from '@playwright/test'

import { ADMIN, apiAs, unique } from './helpers'

/** Runs the real OIDC flow: app -> mock IdP login form -> callback -> app. */
async function signInWithSso(page: Page, subject: string, claims: Record<string, string>) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in with Mock IdP' }).click()
  await expect(page).toHaveURL(/mock-idp:8080\/default\/authorize/)
  await page.locator('input[name="username"]').fill(subject)
  await page.locator('textarea').fill(JSON.stringify(claims))
  await page.getByRole('button', { name: 'Sign-in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

test('SSO creates the user on first login and finds the same user next time', async ({ page, baseURL }) => {
  const id = unique()
  const subject = `subject-${id}`
  const username = `sso-${id}`

  await signInWithSso(page, subject, { preferred_username: username, name: 'SSO Tester' })
  await expect(page.getByText('SSO Tester')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  // Same subject, changed username: still the same account (matched by subject).
  await signInWithSso(page, subject, { preferred_username: `${username}-renamed`, name: 'SSO Tester' })

  const admin = await apiAs(baseURL!, ADMIN)
  const users = (await (await admin.get('/api/users/')).json()) as { username: string }[]
  expect(users.filter((user) => user.username.startsWith(username))).toHaveLength(1)
})
