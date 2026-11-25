import { expect } from '@playwright/test'

import { COOK, apiAs, expectLoaded, signIn, test, unique } from './helpers'

// The e2e stack points the backend at e2e/mock-anthropic, which reads the pasted
// text line by line: name, measurement, ingredient, then one step per line.
test('import a pasted recipe, review it, and save with new lookups', async ({ page }) => {
  const id = unique()
  const name = `Imported Soup ${id}`
  const measurement = `ladle-${id}`
  const ingredient = `nettle-${id}`

  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  // A first read with a typo in the name, fixed after going back with Edit text.
  await page.getByLabel('Recipe text').fill([`${name}x`, measurement, ingredient, 'Wash the nettles.', 'Simmer.'].join('\n'))
  await page.getByRole('button', { name: 'Read recipe' }).click()
  await expect(page.getByLabel('Name')).toHaveValue(`${name}x`)
  await page.getByRole('button', { name: 'Edit text' }).click()
  await page.getByLabel('Recipe text').fill([name, measurement, ingredient, 'Wash the nettles.', 'Simmer.'].join('\n'))
  await page.getByRole('button', { name: 'Read recipe' }).click()

  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible()
  await expect(page.getByRole('complementary')).toContainText('Wash the nettles.')
  // The mock reports 1 token each way.
  await expect(page.getByText('Read by claude-sonnet-5-5: 1 tokens in, 1 out, costing $0.000.')).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveValue(name)
  await expect(page.getByText(`New: “${ingredient}”, added when you save.`)).toBeVisible()
  await expect(page.getByText(`New: “${measurement}”, added when you save.`)).toBeVisible()

  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: ingredient })).toHaveText(`1 ½ ${measurement}s ${ingredient}`)
  await expect(page.getByText('Simmer.')).toBeVisible()
  await expect(page.getByText('Imported by the mock.')).toBeVisible()
})

test('an import keeps its group, line note, existing tags and author in their own fields', async ({ page, baseURL }) => {
  const id = unique()
  const name = `Grouped Soup ${id}`
  const tag = `soups-${id}`
  const author = `Ana Roux ${id}`
  const api = await apiAs(baseURL!, COOK)
  expect((await api.post('/api/tags/', { data: { name: tag } })).status()).toBe(201)
  await api.dispose()

  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  const lines = [name, 'cup', `stock-${id}`, `@author ${author}`, `@tag ${tag}`, `@tag made-up-${id}`, '@group Broth', '@note 1-2 cups', 'Simmer.']
  await page.getByLabel('Recipe text').fill(lines.join('\n'))
  await page.getByRole('button', { name: 'Read recipe' }).click()

  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible()
  await expect(page.getByText(`New: “${author}”, added when you save.`)).toBeVisible()
  // Only the existing tag is picked; the made-up one is dropped, not created.
  await expect(page.getByRole('list', { name: 'Tags' }).getByRole('listitem')).toHaveText([`${tag}×`])
  await expect(page.getByLabel('Group')).toHaveValue('Broth')
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('1-2 cups')
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Broth', level: 3 })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Broth' }).getByRole('listitem')).toHaveText([`1 ½ cups stock-${id} (1-2 cups)`])
  await expect(page.getByRole('list', { name: 'Tags' })).toContainText(tag)

  await page.getByRole('link', { name: author }).click()
  await expect(page.getByRole('heading', { name: author, level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recipes' }).getByRole('link', { name })).toBeVisible()
})

test('an edited import review asks before it is left, and saves without asking', async ({ page }) => {
  const name = `Guarded Soup ${unique()}`
  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByLabel('Recipe text').fill(['Draft', 'cup', 'water', 'Boil.'].join('\n'))
  await page.getByRole('button', { name: 'Read recipe' }).click()
  await page.getByLabel('Name').fill(name)

  const messages: string[] = []
  page.on('dialog', (dialog) => {
    messages.push(dialog.message())
    void dialog.dismiss()
  })
  const leaves = [
    () => page.getByRole('link', { name: 'Cookbooks' }).click(),
    () => page.getByRole('button', { name: 'Edit text' }).click(),
    () => page.evaluate(() => history.back()),
  ]
  for (const [i, leave] of leaves.entries()) {
    await leave()
    await expect.poll(() => messages).toEqual(Array(i + 1).fill('Discard unsaved changes?'))
  }
  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveValue(name)

  await page.getByRole('button', { name: 'Save recipe' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  expect(messages).toHaveLength(leaves.length)
})

test('import from photos of the pages', async ({ page }) => {
  const name = `Photographed Stew ${unique()}`
  await page.goto('/')
  await signIn(page, COOK)
  // Any image the browser can decode will do; the mock doesn't look at it.
  const shot = await page.screenshot()
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByLabel(/Or photos of the pages/).setInputFiles([
    { name: 'page1.png', mimeType: 'image/png', buffer: shot },
    { name: 'page2.png', mimeType: 'image/png', buffer: shot },
  ])
  await expect(page.getByRole('img', { name: 'Page 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Read photos' }).click()

  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible()
  await expect(page.getByRole('complementary').getByRole('img')).toHaveCount(2)
  await page.getByLabel('Name').fill(name)
  // No recipe image unless a page is picked as one.
  await expect(page.getByText('No photo yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Use page 2' }).click()
  await expect(page.getByRole('img', { name: 'Recipe photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByText('Step from photo 2.')).toBeVisible()
  await expectLoaded(page.getByRole('img', { name }))

  // The pages as sent, kept with the import.
  await page.getByRole('link', { name: 'View original' }).click()
  await expect(page.getByRole('heading', { name: 'Original import' })).toBeVisible()
  await expectLoaded(page.getByRole('img', { name: 'Page 1' }))
  await expectLoaded(page.getByRole('img', { name: 'Page 2' }))
})

test('a file that is not an image is named, and the photos beside it are kept', async ({ page }) => {
  await page.goto('/')
  await signIn(page, COOK)
  const shot = await page.screenshot()
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByLabel(/Or photos of the pages/).setInputFiles([
    { name: 'page1.png', mimeType: 'image/png', buffer: shot },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') },
  ])

  await expect(page.getByText('Couldn’t open notes.txt. Try a JPEG or PNG.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Page 2' })).toHaveCount(0)
})

test('import from a link to the recipe page', async ({ page }) => {
  const id = unique()
  const name = `Linked Soup ${id}`
  const text = [name, 'whole', `leek-${id}`, 'Slice the leeks.'].join('\n')
  // The mock serves this page on the e2e network, which RECIPES_IMPORT_FETCH_PRIVATE lets the backend reach.
  const url = `http://mock-anthropic:8080/page?text=${encodeURIComponent(text)}`
  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByLabel('Or a link to the recipe').fill(url)
  await page.getByRole('button', { name: 'Read link' }).click()

  await expect(page.getByRole('heading', { name: 'Review import' })).toBeVisible()
  await expect(page.getByRole('complementary').getByRole('link')).toHaveAttribute('href', url)
  // The page's og:image, fetched by the backend and converted here.
  await expect(page.getByRole('img', { name: 'Recipe photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByText('Slice the leeks.')).toBeVisible()
  await expectLoaded(page.getByRole('img', { name }))
  await expect(page.getByRole('link', { name: 'mock-anthropic' })).toHaveAttribute('href', url)

  // The whole page as fetched is kept, and served as text rather than rendered.
  await page.getByRole('link', { name: 'View original' }).click()
  await expect(page.getByRole('link', { name: url })).toHaveAttribute('href', url)
  const html = await page.request.get((await page.getByRole('link', { name: "The page's HTML" }).getAttribute('href'))!)
  expect(html.headers()['content-type']).toBe('text/plain; charset=utf-8')
  expect(await html.text()).toContain('Slice the leeks.')
})

test("a link that can't be opened says why", async ({ page }) => {
  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByLabel('Or a link to the recipe').fill('http://no-such-host.invalid/recipe')
  await page.getByRole('button', { name: 'Read link' }).click()

  await expect(page.getByText("Couldn't open that page: that site's address doesn't resolve. Try pasting the recipe text.")).toBeVisible()
})

test("a link's picture can be dropped before saving", async ({ page }) => {
  const id = unique()
  const name = `Pictureless Soup ${id}`
  const text = [name, 'whole', `leek-${id}`, 'Slice the leeks.'].join('\n')
  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByLabel('Or a link to the recipe').fill(`http://mock-anthropic:8080/page?text=${encodeURIComponent(text)}`)
  await page.getByRole('button', { name: 'Read link' }).click()

  await expect(page.getByRole('img', { name: 'Recipe photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('img', { name })).toHaveCount(0)
})

test('Import and New recipe are one Tab stop each and open with Enter', async ({ page }) => {
  await page.goto('/')
  await signIn(page, COOK)
  const importLink = page.getByRole('link', { name: 'Import', exact: true })
  await importLink.focus()
  // A button nested in the link would take the next Tab stop.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'New recipe', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible()
})

test('an import’s cost shows on its recipe and in the cost history', async ({ page }) => {
  const name = `Costed Soup ${unique()}`
  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Import', exact: true }).click()
  await page.getByLabel('Recipe text').fill([name, 'cup', 'water', 'Boil.'].join('\n'))
  await page.getByRole('button', { name: 'Read recipe' }).click()
  await page.getByRole('button', { name: 'Save recipe' }).click()

  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.locator('.detail-meta')).toContainText('Import cost$0.000')

  // What was pasted is kept, and reachable from the recipe and the cost history.
  await page.getByRole('link', { name: 'View original' }).click()
  await expect(page.getByRole('heading', { name: 'Original import' })).toBeVisible()
  await expect(page.locator('.original-text')).toHaveText([name, 'cup', 'water', 'Boil.'].join('\n'))
  await page.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  await page.getByRole('link', { name: 'Import costs' }).click()
  const imports = page.getByRole('table', { name: 'Imports' }).getByRole('row')
  const row = imports.filter({ hasText: name })
  await expect(row).toContainText('claude-sonnet-5-5')
  await expect(row.getByRole('link', { name: 'View original' })).toBeVisible()
  const deleted = imports.filter({ hasText: 'Recipe deleted' })
  const deletedBefore = await deleted.count()
  await row.getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // Deleting the recipe keeps its cost, labelled as deleted rather than never saved.
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()
  await page.getByRole('link', { name: 'Import costs' }).click()
  await expect(deleted).toHaveCount(deletedBefore + 1)
  await expect(imports.filter({ hasText: name })).toHaveCount(0)
})
