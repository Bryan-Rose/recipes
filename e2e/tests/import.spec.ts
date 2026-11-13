import { expect } from '@playwright/test'

import { COOK, expectLoaded, signIn, test, unique } from './helpers'

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
