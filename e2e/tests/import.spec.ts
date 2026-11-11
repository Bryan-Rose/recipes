import { expect, test } from '@playwright/test'

import { COOK, signIn, unique } from './helpers'

// The e2e stack points the backend at e2e/mock-anthropic, which reads the pasted
// text line by line: name, measurement, ingredient, then one step per line.
test('import a pasted recipe, review it, and save with new lookups', async ({ page }) => {
  const id = unique()
  const name = `Imported Soup ${id}`
  const measurement = `ladle-${id}`
  const ingredient = `nettle-${id}`

  await page.goto('/')
  await signIn(page, COOK)
  await page.getByRole('button', { name: 'Import' }).click()
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
