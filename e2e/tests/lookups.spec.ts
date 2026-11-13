import { expect } from '@playwright/test'

import { COOK, apiAs, signIn, test, unique } from './helpers'

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

test('a cook adds a cookbook with a new author, then files a recipe in it', async ({ page }) => {
  const suffix = unique()
  const authorName = `E2E New Author ${suffix}`
  const bookName = `E2E New Book ${suffix}`

  await page.goto('/lookups/cookbooks')
  await signIn(page, COOK)
  const form = page.getByRole('form', { name: 'Add a cookbook' })
  await form.getByLabel('Name', { exact: true }).fill(bookName)
  await form.getByRole('button', { name: '+ New author' }).click()
  await form.getByLabel('New author name').fill(authorName)
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(form.getByLabel('Author', { exact: true })).toHaveValue(/\d+/)
  await form.getByRole('button', { name: 'Add cookbook' }).click()
  await expect(page.getByRole('listitem', { name: bookName, exact: true }).getByText(`${authorName} · 0 recipes`)).toBeVisible()

  // The same author can't have two books with one name.
  await form.getByLabel('Name', { exact: true }).fill(bookName.toUpperCase())
  await form.getByRole('button', { name: 'Add cookbook' }).click()
  await expect(form.getByText('That author already has a cookbook with this name.')).toBeVisible()

  // The new cookbook is on offer for a recipe.
  const recipeName = `E2E Filed ${suffix}`
  await page.goto('/recipes/new')
  await page.getByLabel('Name').fill(recipeName)
  await page.getByLabel('Cookbook').selectOption({ label: `${bookName} — ${authorName}` })
  await page.getByRole('button', { name: 'Save recipe' }).click()
  await expect(page.getByRole('heading', { name: recipeName })).toBeVisible()
  await expect(page.getByRole('link', { name: bookName })).toBeVisible()
})

test('lookups are listed by name, ignoring case', async ({ page, baseURL }) => {
  const suffix = unique()
  const api = await apiAs(baseURL!, COOK)
  const names = ['banana', 'Cherry', 'apple'].map((fruit) => `E2E Sort ${suffix} ${fruit}`)
  const ids = []
  for (const name of names) ids.push((await (await api.post('/api/ingredients/', { data: { name } })).json()).id)

  await page.goto('/')
  await signIn(page, COOK)
  await page.goto('/lookups/ingredients')
  const rows = page.getByRole('listitem').filter({ hasText: `E2E Sort ${suffix}` })
  await expect(rows).toHaveCount(3)
  const shown = await rows.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
  expect(shown).toEqual([names[2], names[0], names[1]])

  for (const id of ids) await api.delete(`/api/ingredients/${id}`)
  await api.dispose()
})
