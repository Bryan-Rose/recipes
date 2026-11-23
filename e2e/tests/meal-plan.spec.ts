import { expect } from '@playwright/test'

import { COOK, apiAs, signIn, test, unique } from './helpers'

test('plan a week of meals and add it to the shopping list', async ({ page, baseURL }) => {
  const id = unique()
  const api = await apiAs(baseURL!, COOK)
  const make = async (path: string, data: object) => (await (await api.post(`/api${path}`, { data })).json()).id as number
  const butter = await make('/ingredients/', { name: `butter-${id}` })
  const cup = await make('/measurements/', { name: `${id} cup` })
  const cake = `E2E Plan Cake ${id}`
  const cakeId = await make('/recipes/', {
    name: cake,
    servings: 2,
    recipe_ingredients: [{ ingredient_id: butter, measurement_id: cup, amount_numerator: 1, amount_denominator: 2 }],
  })

  // A week no other test plans: Monday 7 January 2030, opened from a Thursday.
  await page.goto('/plan?week=2030-01-10')
  await signIn(page, COOK)
  await expect(page.getByText('Nothing planned.')).toHaveCount(7)

  for (const day of ['2030-01-07', '2030-01-09']) {
    await page.getByLabel('Recipe').selectOption({ label: cake })
    await page.getByLabel('Day').selectOption(day)
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
  await expect(page.getByRole('checkbox', { name: `1 ½ ${id} cups butter-${id}` })).toBeVisible()

  // Deleting the recipe takes it off the plan and the list, which other tests share.
  expect((await api.delete(`/api/recipes/${cakeId}`)).status()).toBe(204)
  await page.goto('/plan?week=2030-01-07')
  await expect(page.getByText('Nothing planned.')).toHaveCount(7)
})
