import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, expect, it, onTestFinished, vi } from 'vitest'

import App from '../App'
import type { ShoppingList } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const cup = { id: 1, name: 'cup' }
const list: ShoppingList = {
  recipes: [
    { recipe_id: 7, name: 'Pancakes', servings: 6, recipe_servings: 4, batches: 1 },
    { recipe_id: 8, name: 'Toast', servings: null, recipe_servings: null, batches: 2 },
  ],
  lines: [
    // ⅓ + ⅛ cup: no eighth or third matches, so it rounds.
    { ingredient: { id: 1, name: 'butter' }, measurement: cup, amount_numerator: 11, amount_denominator: 24, checked: false },
    { ingredient: { id: 2, name: 'flour' }, measurement: cup, amount_numerator: 3, amount_denominator: 2, checked: true },
    {
      ingredient: { id: 3, name: 'salt' },
      measurement: { id: 2, name: 'to taste' },
      amount_numerator: 1,
      amount_denominator: 1,
      checked: false,
    },
  ],
}

/** Serves `list` and records every write as "METHOD path [body]". */
function show(data: ShoppingList = list) {
  const writes: string[] = []
  const record = async ({ request }: { request: Request }) => {
    const body = await request.text()
    writes.push(`${request.method} ${new URL(request.url).pathname}${body ? ` ${body}` : ''}`)
    return new HttpResponse(null, { status: 204 })
  }
  server.use(
    http.get('/api/shopping-list', () => HttpResponse.json(data)),
    http.put('/api/shopping-list/*', record),
    http.delete('/api/shopping-list*', record),
  )
  renderWithProviders(<App />, { route: '/shopping' })
  return writes
}

const lines = () =>
  within(screen.getByRole('list', { name: 'Ingredients' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent)

beforeEach(() => signedIn())

it('lists the summed lines, rounding what no fraction shows', async () => {
  show()
  expect(await screen.findByRole('checkbox', { name: '≈½ cup butter' })).not.toBeChecked()
  expect(lines()).toEqual(['≈½ cup butter', '1 ½ cups flour', 'salt, to taste'])
  expect(screen.getByRole('checkbox', { name: '1 ½ cups flour' })).toBeChecked()
})

it('ticks and unticks lines', async () => {
  const user = userEvent.setup()
  const writes = show()
  await user.click(await screen.findByRole('checkbox', { name: '≈½ cup butter' }))
  await user.click(screen.getByRole('checkbox', { name: '1 ½ cups flour' }))
  expect(writes).toEqual(['PUT /api/shopping-list/checks/1/1', 'DELETE /api/shopping-list/checks/2/1'])
})

it('ticks at once, before the server answers', async () => {
  const user = userEvent.setup()
  show()
  server.use(http.put('/api/shopping-list/checks/1/1', () => delay('infinite')))
  const box = await screen.findByRole('checkbox', { name: '≈½ cup butter' })
  await user.click(box)
  expect(box).toBeChecked()
})

it('changes servings on leaving the box, and only for a valid count', async () => {
  const user = userEvent.setup()
  const writes = show()
  const box = await screen.findByLabelText('Servings of Pancakes')
  expect(box).toHaveValue(6)
  // Toast has no servings to scale from.
  expect(screen.queryByLabelText('Servings of Toast')).not.toBeInTheDocument()

  await user.clear(box)
  await user.tab()
  expect(box).toHaveValue(6)
  await user.clear(box)
  await user.type(box, '2')
  await user.tab()
  expect(writes).toEqual(['PUT /api/shopping-list/recipes/7 {"servings":2}'])
})

it('changes batches of a recipe with no servings count', async () => {
  const user = userEvent.setup()
  const writes = show()
  const box = await screen.findByLabelText('Batches of Toast')
  expect(box).toHaveValue(2)
  expect(screen.queryByLabelText('Batches of Pancakes')).not.toBeInTheDocument()

  await user.clear(box)
  await user.type(box, '0')
  await user.tab()
  expect(box).toHaveValue(2)
  await user.clear(box)
  await user.type(box, '3')
  await user.tab()
  expect(writes).toEqual(['PUT /api/shopping-list/recipes/8 {"servings":null,"batches":3}'])
})

it('removes a recipe and clears the list after asking', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  onTestFinished(() => confirm.mockRestore())
  const user = userEvent.setup()
  const writes = show()
  await user.click(await screen.findByRole('button', { name: 'Remove Toast' }))
  await user.click(screen.getByRole('button', { name: 'Clear list' }))
  await user.click(screen.getByRole('button', { name: 'Clear list' }))
  expect(writes).toEqual(['DELETE /api/shopping-list/recipes/8', 'DELETE /api/shopping-list'])
})

it('says when the list is empty', async () => {
  show({ recipes: [], lines: [] })
  expect(await screen.findByText(/Nothing on the list/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Clear list' })).not.toBeInTheDocument()
})
