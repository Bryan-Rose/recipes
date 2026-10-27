import { expect, test } from '@playwright/test'

import { ADMIN, apiAs, signIn, unique } from './helpers'

test('a user changes their own password and their other sessions end', async ({ page, browser, baseURL }) => {
  // A throwaway user, so the seeded logins keep their passwords.
  const user = { username: `e2e-pw-${unique()}`, password: 'first-password' }
  const admin = await apiAs(baseURL!, ADMIN)
  const created = await admin.post('/api/users/', { data: { ...user, full_name: 'Password Changer' } })
  expect(created.status()).toBe(201)
  await admin.dispose()

  // A second session, which the change should sign out.
  const otherContext = await browser.newContext({ baseURL })
  const other = await otherContext.newPage()
  await other.goto('/')
  await signIn(other, user)

  await page.goto('/')
  await signIn(page, user)
  await page.getByRole('link', { name: 'Password Changer' }).click()
  const form = page.getByRole('form', { name: 'Change password' })

  await form.getByLabel('Current password').fill('wrong-password')
  await form.getByLabel('New password', { exact: true }).fill('second-password')
  await form.getByLabel('Confirm new password').fill('second-password')
  await form.getByRole('button', { name: 'Change password' }).click()
  await expect(form.getByText('Current password is incorrect')).toBeVisible()

  await form.getByLabel('Current password').fill(user.password)
  await form.getByRole('button', { name: 'Change password' }).click()
  await expect(form.getByRole('status')).toContainText('Password changed')

  // This session survives; the other one is gone.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
  await other.reload()
  await expect(other.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await otherContext.close()

  const login = (password: string) =>
    page.request.post('/api/auth/login', { data: { username: user.username, password } }).then((r) => r.status())
  expect(await login('first-password')).toBe(401)
  expect(await login('second-password')).toBe(204)
})
