import { expect, request, test } from '@playwright/test'

import { ADMIN, COOK, signIn, unique } from './helpers'

/** The status the login API answers for these credentials. */
async function loginStatus(baseURL: string, user: { username: string; password: string }) {
  const api = await request.newContext({ baseURL })
  const status = (await api.post('/api/auth/login', { data: user })).status()
  await api.dispose()
  return status
}

test('non-admins get no Users link and no Users page', async ({ page }) => {
  await page.goto('/users')
  await signIn(page, COOK)

  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toBeHidden()
})

test('an admin adds, edits, promotes, deactivates and deletes a user', async ({ page, browser, baseURL }) => {
  const username = `e2e-user-${unique()}`
  await page.goto('/')
  await signIn(page, ADMIN)
  await page.getByRole('link', { name: 'Users' }).click()
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()

  // Your own row can't be deactivated, demoted or deleted.
  const me = page.getByRole('listitem', { name: ADMIN.username, exact: true })
  await expect(me.getByRole('checkbox', { name: 'Active' })).toBeDisabled()
  await expect(me.getByRole('checkbox', { name: 'Admin' })).toBeDisabled()
  await expect(me.getByRole('button', { name: 'Delete' })).toBeHidden()

  const form = page.getByRole('form', { name: 'Add a user' })
  await form.getByLabel('Username').fill(username)
  await form.getByLabel('Full name').fill('Julia Child')
  await form.getByLabel('Password').fill('first-password')
  await form.getByRole('button', { name: 'Add user' }).click()

  const row = page.getByRole('listitem', { name: username, exact: true })
  await expect(row.getByText('Julia Child')).toBeVisible()
  expect(await loginStatus(baseURL!, { username, password: 'first-password' })).toBe(204)

  await row.getByRole('button', { name: 'Edit' }).click()
  await row.getByLabel('Full name').fill('Julia McWilliams Child')
  await row.getByLabel('New password').fill('second-password')
  await row.getByRole('button', { name: 'Save' }).click()
  await expect(row.getByText('Julia McWilliams Child')).toBeVisible()
  expect(await loginStatus(baseURL!, { username, password: 'first-password' })).toBe(401)
  expect(await loginStatus(baseURL!, { username, password: 'second-password' })).toBe(204)

  // The checkboxes follow the server, so click() rather than check(), which expects an instant change.
  // Promoted, the new user sees the Users page in their own browser.
  await row.getByRole('checkbox', { name: 'Admin' }).click()
  await expect(row.getByRole('checkbox', { name: 'Admin' })).toBeChecked()
  const theirContext = await browser.newContext({ baseURL })
  const theirs = await theirContext.newPage()
  await theirs.goto('/users')
  await signIn(theirs, { username, password: 'second-password' })
  await expect(theirs.getByRole('heading', { name: 'Users' })).toBeVisible()

  // Deactivating ends their session and blocks new sign-ins.
  await row.getByRole('checkbox', { name: 'Active' }).click()
  await expect(row.getByRole('checkbox', { name: 'Active' })).not.toBeChecked()
  await theirs.reload()
  await expect(theirs.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(await loginStatus(baseURL!, { username, password: 'second-password' })).not.toBe(204)
  await theirContext.close()

  page.once('dialog', (dialog) => void dialog.accept())
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(row).toBeHidden()
  await page.reload()
  await expect(page.getByRole('listitem', { name: ADMIN.username, exact: true })).toBeVisible()
  await expect(row).toBeHidden()
})
