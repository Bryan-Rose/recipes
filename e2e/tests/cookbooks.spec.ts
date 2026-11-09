import { expect, test } from '@playwright/test'

import { COOK, apiAs, signIn, unique } from './helpers'

test('browse from a recipe card to its cookbook and author', async ({ page, baseURL }) => {
  const suffix = unique()
  const api = await apiAs(baseURL!, COOK)
  const author = await (await api.post('/api/authors/', { data: { name: `E2E Browse Author ${suffix}` } })).json()
  const book = await (
    await api.post('/api/cookbooks/', { data: { name: `E2E Browse Book ${suffix}`, author_id: author.id } })
  ).json()
  for (const [name, page] of [
    [`E2E Late ${suffix}`, 200],
    [`E2E Early ${suffix}`, 12],
  ] as const) {
    await api.post('/api/recipes/', { data: { name, cookbook_id: book.id, cookbook_page: page } })
  }

  await page.goto('/')
  await signIn(page, COOK)

  // The card's cookbook link, not the recipe it sits on.
  await page.getByRole('listitem').filter({ hasText: `E2E Late ${suffix}` }).getByRole('link', { name: book.name }).click()
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
