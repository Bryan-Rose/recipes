import { expect, type Page } from '@playwright/test'

import { COOK, PNG, apiAs, expectLoaded, signIn, test, unique } from './helpers'

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

  await page.getByRole('link', { name: 'New recipe', exact: true }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Servings').fill('4')
  await page.getByLabel('Active time (minutes)', { exact: true }).fill('75')

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
  await expect(page.getByText('1 h 15 min')).toBeVisible()

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
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
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

  await page.getByRole('link', { name: 'New recipe', exact: true }).click()
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
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Amount')).toHaveValue('2')
  await expect(page.getByRole('combobox', { name: 'Fraction' }).locator('option:checked')).toHaveText('½')
})

test('adding an ingredient someone else just created says it already exists', async ({ page, baseURL }) => {
  const ingredient = `shallot-${unique()}`

  await page.getByRole('link', { name: 'New recipe', exact: true }).click()
  await page.getByRole('button', { name: '+ Add ingredient' }).click()
  await expect(page.getByLabel('Ingredient', { exact: true })).toBeVisible()

  // Created after the form loaded its list, so the picker can't match it and POSTs a duplicate,
  // differing only in case, which the database still treats as the same name.
  const api = await apiAs(baseURL!, COOK)
  expect((await api.post('/api/ingredients/', { data: { name: ingredient } })).status()).toBe(201)

  await page.getByRole('button', { name: '+ New ingredient' }).click()
  await page.getByLabel('New ingredient name').fill(ingredient.toUpperCase())
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Already exists')).toBeVisible()
  await expect(page.getByText(/constraint failed/)).toBeHidden()
})

test('an amount typed while a new ingredient saves is kept', async ({ page }) => {
  const ingredient = `celeriac-${unique()}`
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/ingredients/', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })

  await page.getByRole('link', { name: 'New recipe', exact: true }).click()
  await page.getByRole('button', { name: '+ Add ingredient' }).click()
  await page.getByRole('button', { name: '+ New ingredient' }).click()
  await page.getByLabel('New ingredient name').fill(ingredient)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByLabel('Amount').fill('4')
  release()

  await expect(page.getByLabel('Ingredient', { exact: true }).locator('option:checked')).toHaveText(ingredient)
  await expect(page.getByLabel('Amount')).toHaveValue('4')
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

  await page.getByRole('link', { name: 'New recipe', exact: true }).click()
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

  await page.getByRole('link', { name: 'Edit', exact: true }).click()
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
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
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

test('the recipe list sorts and filters, and keeps that view after opening a recipe', async ({ page, baseURL }) => {
  const id = unique()
  const api = await apiAs(baseURL!, COOK)
  const author = await (await api.post('/api/authors/', { data: { name: `E2E Sort Author ${id}` } })).json()
  const book = await (await api.post('/api/cookbooks/', { data: { name: `E2E Sort Book ${id}`, author_id: author.id } })).json()
  // Created in this order, so "Recently added" puts Slow first.
  for (const [name, active, inactive] of [
    ['Quick', 10, 0],
    ['Middling', 30, 30],
    ['Slow', 20, 240],
  ] as const) {
    const data = { name: `${name} ${id}`, cookbook_id: book.id, active_cook_time: active, inactive_cook_time: inactive }
    expect((await api.post('/api/recipes/', { data })).status()).toBe(201)
  }
  await api.dispose()

  const titles = page.locator('.recipe-card__title')
  await page.goto('/')
  await page.getByLabel('Cookbook').selectOption({ label: `E2E Sort Book ${id}` })
  await expect(titles).toHaveText([`Middling ${id}`, `Quick ${id}`, `Slow ${id}`])
  await page.getByLabel('Sort by').selectOption('Active time')
  await expect(titles).toHaveText([`Quick ${id}`, `Slow ${id}`, `Middling ${id}`])
  await page.getByLabel('Sort by').selectOption('Total time')
  await expect(titles).toHaveText([`Quick ${id}`, `Middling ${id}`, `Slow ${id}`])
  await page.getByLabel('Sort by').selectOption('Recently added')
  await expect(titles).toHaveText([`Slow ${id}`, `Middling ${id}`, `Quick ${id}`])
  await expect(page.getByText('4 h 20 min total')).toBeVisible()

  await page.getByRole('link', { name: `Quick ${id}` }).click()
  await expect(page.getByRole('heading', { name: `Quick ${id}` })).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Sort by')).toHaveValue('added')
  await expect(titles).toHaveText([`Slow ${id}`, `Middling ${id}`, `Quick ${id}`])
})

test('the recipe list finds a recipe by ingredient and counts its ingredients and steps', async ({ page, baseURL }) => {
  const id = unique()
  const api = await apiAs(baseURL!, COOK)
  const ingredient = await (await api.post('/api/ingredients/', { data: { name: `sorrel-${id}` } })).json()
  const measurement = await (await api.post('/api/measurements/', { data: { name: `bunch-${id}` } })).json()
  const data = {
    name: `Green Sauce ${id}`,
    steps: [{ text: 'Chop.' }, { text: 'Stir.' }],
    recipe_ingredients: [{ ingredient_id: ingredient.id, measurement_id: measurement.id, amount_numerator: 1 }],
  }
  expect((await api.post('/api/recipes/', { data })).status()).toBe(201)
  await api.dispose()

  await page.goto('/')
  await page.getByLabel('Search recipes').fill(`SORREL-${id}`)
  const card = page.locator('.recipe-card')
  await expect(card).toHaveCount(1)
  await expect(card.locator('.recipe-card__title')).toHaveText(`Green Sauce ${id}`)
  await expect(card).toContainText('1 ingredients')
  await expect(card).toContainText('2 steps')
})

test('tags are added and removed in the forms, shown, and filter the list', async ({ page, baseURL }) => {
  const id = unique()
  const name = `E2E Tagged ${id}`
  const [weeknight, vegan] = [`weeknight-${id}`, `vegan-${id}`]
  const api = await apiAs(baseURL!, COOK)
  expect((await api.post('/api/tags/', { data: { name: weeknight } })).status()).toBe(201)
  expect((await api.post('/api/recipes/', { data: { name: `E2E Untagged ${id}` } })).status()).toBe(201)

  await page.getByRole('link', { name: 'New recipe', exact: true }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Tag', { exact: true }).selectOption({ label: weeknight })
  await page.getByRole('button', { name: '+ New tag' }).click()
  await page.getByLabel('New tag name').fill(vegan)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Tags' }).getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  const tags = page.getByRole('list', { name: 'Tags' })
  await expect(tags.getByRole('link', { name: vegan })).toBeVisible()
  await expect(tags.getByRole('link', { name: weeknight })).toBeVisible()

  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: `Remove tag ${vegan}` }).click()
  await page.getByRole('button', { name: 'Save details' }).click()
  await expect(page.getByText('Unsaved changes')).toBeHidden()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(tags.getByRole('link')).toHaveText([weeknight])

  // The tag link opens the list filtered by that tag.
  await tags.getByRole('link', { name: weeknight }).click()
  await expect(page.getByLabel('Tag', { exact: true })).toHaveValue(/\d+/)
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: `E2E Untagged ${id}` })).toBeHidden()
  await page.getByLabel('Tag', { exact: true }).selectOption({ label: 'All tags' })
  await expect(page.getByRole('link', { name: `E2E Untagged ${id}` })).toBeVisible()
})

test('an ingredient "to taste" shows no amount and ignores scaling', async ({ page, baseURL }) => {
  const id = unique()
  const api = await apiAs(baseURL!, COOK)
  const ingredient = await (await api.post('/api/ingredients/', { data: { name: `sea salt-${id}` } })).json()
  // The tests share one database, so "to taste" may already exist.
  const posted = await api.post('/api/measurements/', { data: { name: 'to taste' } })
  expect([201, 409], 'created, or already there').toContain(posted.status())
  const measurement = posted.ok()
    ? await posted.json()
    : ((await (await api.get('/api/measurements/')).json()) as { id: number; name: string }[]).find(
        (row) => row.name.toLowerCase() === 'to taste',
      )!
  const data = {
    name: `Seasoned ${id}`,
    servings: 4,
    recipe_ingredients: [{ ingredient_id: ingredient.id, measurement_id: measurement.id, amount_numerator: 1 }],
  }
  const created = await api.post('/api/recipes/', { data })
  expect(created.status()).toBe(201)
  const { id: recipeId } = (await created.json()) as { id: number }
  await api.dispose()

  await page.goto(`/recipes/${recipeId}`)
  const line = page.getByRole('listitem').filter({ hasText: `sea salt-${id}` })
  await expect(line).toHaveText(`sea salt-${id}, to taste`)
  await page.getByLabel('Servings', { exact: true }).fill('8')
  await expect(line).toHaveText(`sea salt-${id}, to taste`)
})

test('recipe names are unique per cookbook', async ({ page, baseURL }) => {
  const suffix = unique()
  const name = `E2E Pancakes ${suffix}`
  const api = await apiAs(baseURL!, COOK)
  const author = await (await api.post('/api/authors/', { data: { name: `E2E Same Author ${suffix}` } })).json()
  const [first, second] = await Promise.all(
    ['First', 'Second'].map(async (which) =>
      (await api.post('/api/cookbooks/', { data: { name: `E2E ${which} Book ${suffix}`, author_id: author.id } })).json(),
    ),
  )
  await api.post('/api/recipes/', { data: { name } })
  await api.post('/api/recipes/', { data: { name, cookbook_id: first.id } })

  // The name is taken without a cookbook and in the first one, but free in the second.
  await page.goto('/recipes/new')
  await page.getByLabel('Name').fill(name.toLowerCase())
  const save = page.getByRole('button', { name: 'Save recipe' })
  await expect(page.getByText('already exists without a cookbook')).toBeVisible()
  await expect(save).toBeDisabled()
  await page.getByLabel('Cookbook').selectOption(String(first.id))
  await expect(page.getByText(`already exists in ${first.name}`)).toBeVisible()
  await page.getByLabel('Cookbook').selectOption(String(second.id))
  await save.click()
  await expect(page.getByRole('heading', { name: name.toLowerCase() })).toBeVisible()

  // The list tells the three apart by cookbook.
  await page.goto(`/?q=${encodeURIComponent(name)}`)
  const cards = page.getByRole('list', { name: 'Recipes' }).getByRole('listitem').filter({ hasText: name })
  await expect(cards).toHaveCount(3)
  for (const book of [first, second]) await expect(cards.filter({ hasText: book.name })).toHaveCount(1)

  // Deleting the first cookbook would leave two cookbook-less recipes with the name, so it's refused.
  await page.goto('/lookups/cookbooks')
  const bookRow = page.getByRole('listitem', { name: first.name, exact: true })
  page.once('dialog', (dialog) => void dialog.accept())
  await bookRow.getByRole('button', { name: 'Delete' }).click()
  await expect(bookRow.getByText(`Rename one first: ${name}`)).toBeVisible()
  await api.dispose()
})

test('a recipe photo shows on the recipe and in the list, and can be replaced and removed', async ({ page }) => {
  const name = `E2E Photo ${unique()}`

  await page.getByRole('link', { name: 'New recipe', exact: true }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Add a photo').setInputFiles({ name: 'dish.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Recipe photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  const cover = page.getByRole('img', { name })
  await expectLoaded(cover)
  const firstSrc = await cover.getAttribute('src')

  await page.getByRole('link', { name: '← All recipes' }).click()
  const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) })
  await expectLoaded(card.locator('img.recipe-card__thumb'))

  await card.getByRole('link', { name, exact: true }).click()
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Replace photo').setInputFiles({ name: 'better.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Recipe photo' })).not.toHaveAttribute('src', firstSrc!)
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await expect(page.getByText('No photo yet.')).toBeVisible()

  // The old files are gone, not just unlinked.
  expect((await page.request.get(firstSrc!)).status()).toBe(404)

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('img')).toHaveCount(0)
})
