import { expect, test, type Page } from '@playwright/test'

import { COOK, signIn, unique } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await signIn(page, COOK)
})

/** Creates a lookup row inline through a picker's "+ New …" control. */
async function createInline(page: Page, label: string, name: string) {
  await page.getByRole('button', { name: `+ New ${label.toLowerCase()}` }).click()
  await page.getByLabel(`New ${label.toLowerCase()} name`).fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(/\d+/)
}

test('create, view, edit and delete a recipe', async ({ page }) => {
  const id = unique()
  const name = `E2E Soup ${id}`
  const ingredient = `leek-${id}`

  await page.getByRole('button', { name: 'New recipe' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Servings').fill('4')

  await page.getByRole('button', { name: '+ Add ingredient' }).click()
  await page.getByLabel('Amount').fill('3')
  await createInline(page, 'Measurement', `bunch-${id}`)
  await createInline(page, 'Ingredient', ingredient)
  await createInline(page, 'Preparation', `sliced-${id}`)

  await page.getByRole('button', { name: '+ Add item' }).click()
  await page.getByPlaceholder('Large pot').fill('Stock pot')
  await page.getByRole('button', { name: '+ Add step' }).click()
  await page.getByPlaceholder('Describe this step…').fill('Simmer gently for an hour.')

  await page.getByRole('button', { name: 'Save recipe' }).click()

  // Detail page, rendered from what the API stored.
  await expect(page).toHaveURL(/\/recipes\/\d+$/)
  const detailUrl = page.url()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByText(ingredient)).toBeVisible()
  await expect(page.getByText('Stock pot')).toBeVisible()
  await expect(page.getByText('Simmer gently for an hour.')).toBeVisible()

  // A deep link to it works after a full reload (nginx serves the SPA for any path).
  await page.reload()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // Edit the name.
  const renamed = `${name} (revised)`
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible()
  await page.getByLabel('Name').fill(renamed)
  await page.getByRole('button', { name: 'Save details' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible()

  // Delete, through the native confirm dialog.
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(renamed)).toBeHidden()
  await page.goto(detailUrl)
  await expect(page.getByText(renamed)).toBeHidden()
})
