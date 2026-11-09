import { expect, test } from '@playwright/test'

import { COOK, apiAs, signIn, unique } from './helpers'

test('a cook renames an author, deletes the cookbook in use, then the author', async ({ page, baseURL }) => {
  const suffix = unique()
  const api = await apiAs(baseURL!, COOK)
  // Misspelt on purpose: the test renames it to fix the typo.
  const author = await (await api.post('/api/authors/', { data: { name: `E2E Auhtor ${suffix}` } })).json()
  const book = await (
    await api.post('/api/cookbooks/', { data: { name: `E2E Book ${suffix}`, author_id: author.id } })
  ).json()
  const recipe = await (
    await api.post('/api/recipes/', { data: { name: `E2E Paged ${suffix}`, cookbook_id: book.id, cookbook_page: 42 } })
  ).json()

  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('link', { name: 'Lookups' }).click()
  await page.getByRole('link', { name: 'Authors' }).click()

  // Fix the typo.
  const authorRow = page.getByRole('listitem', { name: author.name, exact: true })
  await authorRow.getByRole('button', { name: 'Edit' }).click()
  await authorRow.getByLabel('Name').fill(`E2E Author ${suffix}`)
  await authorRow.getByRole('button', { name: 'Save' }).click()
  const renamed = page.getByRole('listitem', { name: `E2E Author ${suffix}`, exact: true })
  await expect(renamed).toBeVisible()

  // Still has a cookbook, so the delete is refused with a reason.
  page.once('dialog', (dialog) => void dialog.accept())
  await renamed.getByRole('button', { name: 'Delete' }).click()
  await expect(renamed.getByText('It’s still used by a cookbook, so it can’t be deleted.')).toBeVisible()

  // The cookbook delete names the recipe it unlinks.
  await page.getByRole('navigation', { name: 'Lookup types' }).getByRole('link', { name: 'Cookbooks' }).click()
  const bookRow = page.getByRole('listitem', { name: book.name, exact: true })
  await expect(bookRow.getByText(`E2E Author ${suffix} · 1 recipe`)).toBeVisible()
  let message = ''
  page.once('dialog', (dialog) => {
    message = dialog.message()
    void dialog.accept()
  })
  await bookRow.getByRole('button', { name: 'Delete' }).click()
  await expect(bookRow).toBeHidden()
  expect(message).toContain(`1 recipe uses “${book.name}”`)

  // The recipe keeps its content but loses the cookbook and its page.
  const after = await (await api.get(`/api/recipes/${recipe.id}`)).json()
  expect([after.cookbook_id, after.cookbook_page]).toEqual([null, null])
  await page.goto(`/recipes/${recipe.id}`)
  await expect(page.getByRole('heading', { name: recipe.name })).toBeVisible()
  await expect(page.getByText(book.name)).toBeHidden()

  // Nothing uses the author now.
  await page.goto('/lookups/authors')
  page.once('dialog', (dialog) => void dialog.accept())
  await renamed.getByRole('button', { name: 'Delete' }).click()
  await expect(renamed).toBeHidden()
  await api.dispose()
})
