import { expect } from '@playwright/test'

import { COOK, apiAs, signIn, test, unique } from './helpers'

test('plan a week of meals and add it to the shopping list', async ({ page, baseURL }) => {
  const id = unique()
  const api = await apiAs(baseURL!, COOK)
  const make = async (path: string, data: object) => (await (await api.post(`/api${path}`, { data })).json()).id as number
  const butter = await make('/ingredients/', { name: `butter-${id}` })
  const cup = await make('/measurements/', { name: `${id} cup` })
  const amount = (numerator: number, denominator: number) => [
    { ingredient_id: butter, measurement_id: cup, amount_numerator: numerator, amount_denominator: denominator },
  ]
  const cake = `E2E Plan Cake ${id}`
  const cakeId = await make('/recipes/', { name: cake, servings: 2, recipe_ingredients: amount(1, 2) })
  // No servings count, so it's shopped for in batches.
  const toast = `E2E Plan Toast ${id}`
  const toastId = await make('/recipes/', { name: toast, recipe_ingredients: amount(1, 4) })

  // A week no other test plans: Monday 7 January 2030, opened from a Thursday.
  await page.goto('/plan?week=2030-01-10')
  await signIn(page, COOK)
  await expect(page.getByText('Nothing planned.')).toHaveCount(7)

  for (const [recipe, day] of [
    [cake, '2030-01-07'],
    [cake, '2030-01-09'],
    [toast, '2030-01-07'],
    [toast, '2030-01-08'],
  ]) {
    await page.getByRole('combobox', { name: 'Recipe', exact: true }).selectOption({ label: recipe })
    await page.getByRole('combobox', { name: 'Day', exact: true }).selectOption(day)
    await page.getByRole('button', { name: 'Plan it' }).click()
  }
  const wednesday = page.getByRole('list', { name: /^Meals on Wednesday/ })
  await expect(wednesday.getByRole('link', { name: cake })).toBeVisible()
  await expect(page.getByRole('list', { name: /^Meals on Monday/ }).getByRole('link', { name: cake })).toBeVisible()

  // Double Wednesday's: 2 + 4 servings in all.
  const servings = wednesday.getByLabel(/^Servings of/)
  await servings.fill('4')
  await servings.blur()
  await page.reload()
  await expect(servings).toHaveValue('4')

  await page.getByRole('button', { name: 'Add week to shopping list' }).click()
  await page.getByRole('link', { name: 'shopping list', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()
  await expect(page.getByLabel(`Servings of ${cake}`, { exact: true })).toHaveValue('6')
  await expect(page.getByLabel(`Batches of ${toast}`)).toHaveValue('2')
  // Cake's 1 ½ cups plus two batches of Toast's ¼.
  await expect(page.getByRole('checkbox', { name: `2 ${id} cups butter-${id}` })).toBeVisible()

  await page.getByLabel(`Batches of ${toast}`).fill('3')
  await page.getByLabel(`Batches of ${toast}`).blur()
  await expect(page.getByRole('checkbox', { name: `2 ¼ ${id} cups butter-${id}` })).toBeVisible()

  // Deleting the recipes takes them off the plan and the list, which other tests share.
  for (const recipeId of [cakeId, toastId]) expect((await api.delete(`/api/recipes/${recipeId}`)).status()).toBe(204)
  await page.goto('/plan?week=2030-01-07')
  await expect(page.getByText('Nothing planned.')).toHaveCount(7)
})
