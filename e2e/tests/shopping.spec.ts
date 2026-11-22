import { expect } from '@playwright/test'

import { ADMIN, COOK, apiAs, signIn, test, unique } from './helpers'

test('build a shared shopping list from two recipes, tick it off and clear it', async ({ page, baseURL }) => {
  const id = unique()
  const api = await apiAs(baseURL!, COOK)
  const make = async (path: string, data: object) => (await (await api.post(`/api${path}`, { data })).json()).id as number
  const butter = await make('/ingredients/', { name: `butter-${id}` })
  // The id goes first, since plurals add the s at the end: "1 ¼ <id> cups".
  const cup = await make('/measurements/', { name: `${id} cup` })
  const amount = (numerator: number, denominator: number) => ({
    ingredient_id: butter,
    measurement_id: cup,
    amount_numerator: numerator,
    amount_denominator: denominator,
  })
  const cake = `E2E Cake ${id}`
  const toast = `E2E Toast ${id}`
  await make('/recipes/', { name: cake, servings: 2, recipe_ingredients: [amount(1, 2)] })
  const toastId = await make('/recipes/', { name: toast, recipe_ingredients: [amount(1, 4)] })

  await page.goto('/')
  await signIn(page, COOK)

  // Cake at double servings: 1 cup, plus Toast's ¼.
  await page.getByRole('link', { name: cake }).click()
  await page.getByLabel('Servings', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Add to shopping list' }).click()
  await expect(page.getByRole('link', { name: 'On shopping list' })).toBeVisible()
  await page.goto(`/recipes/${toastId}`)
  await page.getByRole('button', { name: 'Add to shopping list' }).click()

  await page.getByRole('link', { name: 'On shopping list' }).click()
  const line = page.getByRole('checkbox', { name: `1 ¼ ${id} cups butter-${id}` })
  await expect(line).not.toBeChecked()
  await expect(page.getByLabel(`Servings of ${cake}`)).toHaveValue('4')

  // Back to the recipe's own servings: ½ + ¼.
  await page.getByLabel(`Servings of ${cake}`).fill('2')
  await page.getByLabel(`Servings of ${cake}`).blur()
  await expect(page.getByRole('checkbox', { name: `¾ ${id} cup butter-${id}` })).toBeVisible()

  // Ticks are stored, and the list is everyone's.
  // click, not check(): the box is drawn from the list, so it flips a render after the click.
  await page.getByRole('checkbox', { name: `¾ ${id} cup butter-${id}` }).click()
  await expect(page.getByRole('checkbox', { name: `¾ ${id} cup butter-${id}` })).toBeChecked()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: `¾ ${id} cup butter-${id}` })).toBeChecked()
  const admin = await apiAs(baseURL!, ADMIN)
  const shared = await (await admin.get('/api/shopping-list')).json()
  expect(shared.recipes.map((recipe: { name: string }) => recipe.name)).toEqual([cake, toast])

  // Needing less keeps the tick.
  await page.getByRole('button', { name: `Remove ${toast}` }).click()
  await expect(page.getByRole('checkbox', { name: `½ ${id} cup butter-${id}` })).toBeChecked()

  // The tick covered ¾ cup; doubling the cake to 1 cup puts it back to buy.
  await page.getByLabel(`Servings of ${cake}`).fill('4')
  await page.getByLabel(`Servings of ${cake}`).blur()
  await expect(page.getByRole('checkbox', { name: `1 ${id} cup butter-${id}` })).not.toBeChecked()

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Clear list' }).click()
  await expect(page.getByText('Nothing on the list.')).toBeVisible()
})
