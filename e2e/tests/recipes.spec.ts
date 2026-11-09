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

  // Scale to double the servings: 3 bunches become 6.
  const leek = page.getByRole('listitem').filter({ hasText: ingredient })
  await expect(leek.locator('.ingredient-amount')).toHaveText('3')
  await page.getByLabel('Servings', { exact: true }).fill('8')
  await expect(leek.locator('.ingredient-amount')).toHaveText('6')

  // Edit the name.
  const renamed = `${name} (revised)`
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible()
  await page.getByLabel('Name').fill(renamed)
  await page.getByLabel('Source URL').fill('https://cooking.example.com/soup')
  await page.getByLabel('Notes').fill('Halve the salt.\nServe with crusty bread.')
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByText('Unsaved changes')).toBeHidden() // or Done would ask to discard them
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible()
  await expect(page.getByRole('link', { name: 'cooking.example.com' })).toHaveAttribute('href', 'https://cooking.example.com/soup')
  await expect(page.locator('.recipe-notes')).toHaveText('Halve the salt.\nServe with crusty bread.')

  // Delete, through the native confirm dialog.
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(renamed)).toBeHidden()
  await page.goto(detailUrl)
  await expect(page.getByText(renamed)).toBeHidden()
})

test('an ingredient takes a fractional amount and no preparation', async ({ page }) => {
  const id = unique()
  const ingredient = `flour-${id}`

  await page.getByRole('button', { name: 'New recipe' }).click()
  await page.getByLabel('Name').fill(`E2E Bread ${id}`)
  await page.getByRole('button', { name: '+ Add ingredient' }).click()
  await page.getByLabel('Amount').fill('2')
  await page.getByRole('combobox', { name: 'Fraction' }).selectOption('½')
  await createInline(page, 'Measurement', `scoop-${id}`)
  await createInline(page, 'Ingredient', ingredient)
  await expect(page.getByLabel('Preparation', { exact: true })).toHaveValue('') // None
  await page.getByRole('button', { name: 'Save recipe' }).click()

  const row = page.getByRole('listitem').filter({ hasText: ingredient })
  await expect(row).toHaveText(`2 ½ scoop-${id}s ${ingredient}`)

  // The editor splits the stored 5/2 back into its two controls.
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByLabel('Amount')).toHaveValue('2')
  await expect(page.getByRole('combobox', { name: 'Fraction' }).locator('option:checked')).toHaveText('½')
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

test('steps can be put in order when creating and when editing', async ({ page }) => {
  const name = `E2E Order ${unique()}`
  const steps = page.locator('.step-list li')

  await page.getByRole('button', { name: 'New recipe' }).click()
  await page.getByLabel('Name').fill(name)
  for (const text of ['Chop.', 'Fry.', 'Prep.']) {
    await page.getByRole('button', { name: '+ Add step' }).click()
    await page.getByPlaceholder('Describe this step…').last().fill(text)
  }
  await page.getByRole('button', { name: 'Move step 3 up' }).click()
  await page.getByRole('button', { name: 'Move step 2 up' }).click()
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(steps).toHaveText(['Prep.', 'Chop.', 'Fry.'])

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Move Method entry 1 down' }).click()
  await expect(page.getByPlaceholder('Describe this step…').first()).toHaveValue('Chop.')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.reload() // the order came from the server, not the cache
  await expect(steps).toHaveText(['Chop.', 'Prep.', 'Fry.'])
})

test('leaving with unsaved changes asks first, however you leave', async ({ page, baseURL }) => {
  const api = await apiAs(baseURL!, COOK)
  const name = `E2E Unsaved ${unique()}`
  const created = await api.post('/api/recipes/', { data: { name, servings: 4 } })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: number }

  await page.goto(`/recipes/${id}`)
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible()
  await page.getByLabel('Servings').fill('6')

  const messages: string[] = []
  page.on('dialog', (dialog) => {
    messages.push(dialog.message())
    void dialog.dismiss()
  })
  // Each way out in turn, waiting for its prompt before the next.
  const leaves = [
    () => page.getByRole('button', { name: 'Done' }).click(),
    () => page.getByRole('link', { name: 'Lookups' }).click(),
    () => page.evaluate(() => history.back()),
    () => page.getByRole('button', { name: 'Sign out' }).click(),
  ]
  for (const [i, leave] of leaves.entries()) {
    await leave()
    await expect.poll(() => messages).toEqual(Array(i + 1).fill('Discard unsaved changes?'))
  }
  await expect(page).toHaveURL(`/recipes/${id}/edit`)
  await expect(page.getByLabel('Servings')).toHaveValue('6')
  page.removeAllListeners('dialog')
  // Still signed in after cancelling Sign out: the edit saves.
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByText('Unsaved changes')).toBeHidden()
  await page.getByLabel('Servings').fill('8')

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('link', { name: `← Back to ${name}` }).click()
  await expect(page).toHaveURL(`/recipes/${id}`)
  await expect(page.getByLabel('Servings', { exact: true })).toHaveValue('6')
})

test('a blank recipe name is refused and the old name kept', async ({ page, baseURL }) => {
  const api = await apiAs(baseURL!, COOK)
  const name = `E2E Blank ${unique()}`
  const created = await api.post('/api/recipes/', { data: { name } })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: number }

  await page.goto(`/recipes/${id}/edit`)
  await page.getByLabel('Name').fill('   ') // passes the input's `required`
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByText(/at least 1 character/)).toBeVisible()

  await page.goto(`/recipes/${id}`)
  await expect(page.getByRole('heading', { name })).toBeVisible()
})

test('deleting a recipe someone else already deleted says so and stays put', async ({ page, baseURL }) => {
  const api = await apiAs(baseURL!, COOK)
  const name = `E2E Gone ${unique()}`
  const created = await api.post('/api/recipes/', { data: { name } })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: number }

  await page.goto(`/recipes/${id}`)
  await expect(page.getByRole('heading', { name })).toBeVisible()
  expect((await api.delete(`/api/recipes/${id}`)).status()).toBe(204)

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('not found')).toBeVisible()
  await expect(page).toHaveURL(`/recipes/${id}`)
})
