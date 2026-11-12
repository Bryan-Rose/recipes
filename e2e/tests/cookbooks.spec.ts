import { expect, test } from '@playwright/test'

import { COOK, PNG, apiAs, expectLoaded, signIn, unique } from './helpers'

test('browse from a recipe card to its cookbook and author', async ({ page, baseURL }) => {
  const suffix = unique()
  const api = await apiAs(baseURL!, COOK)
  const author = await (await api.post('/api/authors/', { data: { name: `E2E Browse Author ${suffix}` } })).json()
  const book = await (
    await api.post('/api/cookbooks/', { data: { name: `E2E Browse Book ${suffix}`, author_id: author.id } })
  ).json()
  for (const [name, pageNo] of [
    [`E2E Late ${suffix}`, 200],
    [`E2E Early ${suffix}`, 12],
  ] as const) {
    await api.post('/api/recipes/', { data: { name, cookbook_id: book.id, cookbook_page: pageNo } })
  }

  await page.goto('/')
  await signIn(page, COOK)

  const card = page.getByRole('listitem').filter({ hasText: `E2E Late ${suffix}` })
  // Keyboard focus on the title rings the whole card. Shift+Tab back from the cookbook link is a keyboard move.
  await card.getByRole('link', { name: book.name }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(card.getByRole('link', { name: `E2E Late ${suffix}` })).toBeFocused()
  await expect(card).toHaveCSS('outline-style', 'solid')

  // Anywhere on the card but its links opens the recipe: here, its page number and its stats.
  // The page number is a bare text node beside the cookbook link, so click its own box.
  const pageNoBox = await card.locator('.recipe-card__meta').evaluate((meta) => {
    const range = document.createRange()
    range.selectNode([...meta.childNodes].find((node) => node.textContent === ', p. 200')!)
    const { x, y, width, height } = range.getBoundingClientRect()
    return { x: x + width / 2, y: y + height / 2 }
  })
  await page.mouse.click(pageNoBox.x, pageNoBox.y)
  await expect(page.getByRole('heading', { name: `E2E Late ${suffix}` })).toBeVisible()
  await page.goBack()
  // force: the title's overlay covering the stats is the point, and Playwright would wait for it to move.
  await card.getByText('0 steps').click({ force: true })
  await expect(page.getByRole('heading', { name: `E2E Late ${suffix}` })).toBeVisible()
  await page.goBack()

  // The card's cookbook link, not the recipe it sits on.
  await card.getByRole('link', { name: book.name }).click()
  await expect(page.getByRole('heading', { name: book.name })).toBeVisible()
  await expect(page.getByRole('list', { name: `Recipes in ${book.name}` }).getByRole('listitem')).toHaveText([
    `p. 12E2E Early ${suffix}`,
    `p. 200E2E Late ${suffix}`,
  ])

  await page.getByRole('link', { name: author.name }).click()
  await expect(page.getByRole('heading', { name: author.name })).toBeVisible()
  await expect(page.getByRole('region', { name: book.name }).getByRole('listitem')).toHaveCount(2)

  // The header's index lists it too.
  await page.getByRole('banner').getByRole('link', { name: 'Cookbooks' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: book.name })).toContainText(`by ${author.name} · 2 recipes`)
  await api.dispose()
})

test('a cookbook cover is added in Lookups, shows on the cookbook index, and goes with the cookbook', async ({
  page,
  baseURL,
}) => {
  const suffix = unique()
  const api = await apiAs(baseURL!, COOK)
  const author = await (await api.post('/api/authors/', { data: { name: `E2E Cover Author ${suffix}` } })).json()
  const book = await (
    await api.post('/api/cookbooks/', { data: { name: `E2E Cover Book ${suffix}`, author_id: author.id } })
  ).json()

  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Lookups' }).click()
  await page.getByRole('navigation', { name: 'Lookup types' }).getByRole('link', { name: 'Cookbooks' }).click()
  const row = page.getByRole('listitem', { name: book.name, exact: true })
  await row.getByRole('button', { name: 'Edit' }).click()
  await row.getByLabel('Add a photo').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG })
  await expectLoaded(row.getByRole('img', { name: 'Cookbook cover' }))

  await page.getByRole('banner').getByRole('link', { name: 'Cookbooks' }).click()
  const item = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: book.name, exact: true }) })
  const thumb = item.locator('img.browse-item__cover')
  await expectLoaded(thumb)
  const src = (await thumb.getAttribute('src'))!

  // Deleting the cookbook deletes its files, not just the row.
  expect((await api.delete(`/api/cookbooks/${book.id}`)).status()).toBe(204)
  expect((await api.get(src)).status()).toBe(404)
  await api.dispose()
})
