import { expect, test, type Page } from '@playwright/test'

import { COOK, apiAs, signIn, unique } from './helpers'

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

test('adding an ingredient someone else just created says it already exists', async ({ page, baseURL }) => {
  const ingredient = `shallot-${unique()}`

  await page.getByRole('button', { name: 'New recipe' }).click()
  await page.getByRole('button', { name: '+ Add ingredient' }).click()
  await expect(page.getByLabel('Ingredient', { exact: true })).toBeVisible()

  // Created after the form loaded its list, so the picker can't match it and POSTs a duplicate.
  const api = await apiAs(baseURL!, COOK)
  expect((await api.post('/api/ingredients/', { data: { name: ingredient } })).status()).toBe(201)

  await page.getByRole('button', { name: '+ New ingredient' }).click()
  await page.getByLabel('New ingredient name').fill(ingredient)
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Already exists')).toBeVisible()
  await expect(page.getByText(/constraint failed/)).toBeHidden()
})

test('a step that fails to save keeps its text for a retry', async ({ page, baseURL }) => {
  const api = await apiAs(baseURL!, COOK)
  const created = await api.post('/api/recipes/', { data: { name: `E2E Retry ${unique()}` } })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: number }

  await page.goto(`/recipes/${id}/edit`)
  await page.route(`**/api/recipes/${id}/steps/`, (route) =>
    route.fulfill({ status: 503, json: { detail: 'Server unavailable' } }),
  )
  await page.getByRole('button', { name: '+ Add step' }).click()
  const field = page.getByPlaceholder('Describe this step…')
  await field.fill('Whisk the eggs.')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Server unavailable')).toBeVisible()
  await expect(field).toHaveValue('Whisk the eggs.')

  await page.unroute(`**/api/recipes/${id}/steps/`)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Server unavailable')).toBeHidden()
  await expect(page.getByRole('button', { name: '+ Add step' })).toBeVisible()
  await expect(field).toHaveValue('Whisk the eggs.') // now the saved row

  // A failed edit to a saved step stays in the field, flagged as unsaved.
  await page.route(`**/api/recipes/${id}/steps/*`, (route) =>
    route.fulfill({ status: 503, json: { detail: 'Server unavailable' } }),
  )
  await field.fill('Whisk the eggs well.')
  await field.blur()
  await expect(page.getByText('Server unavailable')).toBeVisible()
  await expect(field).toHaveValue('Whisk the eggs well.')
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible()
})
