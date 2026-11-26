import { expect } from '@playwright/test'

import { test, unique } from './helpers'

// Run by `make e2e`'s second step, against a backend started with RECIPES_AUTH_ENABLED=false.
test.describe('login-free mode', { tag: '@no-login' }, () => {
  test('the app opens without a login page or account links', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Shopping list' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Users' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Household' })).toBeHidden()
  })

  test('a recipe created through the UI shows in the list', async ({ page }) => {
    const name = `E2E Login-free ${unique()}`
    await page.goto('/')

    await page.getByRole('link', { name: 'New recipe', exact: true }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'Save recipe' }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()

    await page.getByRole('link', { name: 'Recipes', exact: true }).click()
    await expect(page.getByRole('link', { name })).toBeVisible()
  })
})
