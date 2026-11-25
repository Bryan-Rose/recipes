import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import App from '../App'
import type { Recipe } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const cup = { id: 1, name: 'cup' }
const recipe: Recipe = {
  id: 7,
  name: 'Pancakes',
  servings: 4,
  created_user_id: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  steps: [],
  requirements: [],
  tags: [],
  recipe_ingredients: [
    { id: 1, amount_numerator: 1, amount_denominator: 2, ingredient: { id: 1, name: 'milk' }, measurement: cup, preparation: null, group: null, note: null },
    { id: 2, amount_numerator: 1, amount_denominator: 3, ingredient: { id: 2, name: 'sugar' }, measurement: cup, preparation: null, group: null, note: null },
  ],
}

const amounts = () => within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)

function show(data: Recipe) {
  server.use(http.get('/api/recipes/7', () => HttpResponse.json(data)))
  renderWithProviders(<App />, { route: '/recipes/7' })
}

it('links to the editor with a single link, with no button inside', async () => {
  signedIn()
  show(recipe)
  const edit = await screen.findByRole('link', { name: 'Edit' })
  expect(edit).toHaveAttribute('href', '/recipes/7/edit')
  expect(within(edit).queryByRole('button')).not.toBeInTheDocument()
})

const sourceImport = { id: 3, model: 'claude-sonnet-5-5', input_tokens: 2400, output_tokens: 610, cost_usd: 0.0109, original_parts: 1 }

it('shows what importing the recipe cost, linking to the original', async () => {
  signedIn()
  show({ ...recipe, source_import: sourceImport })
  expect(await screen.findByText('Import cost')).toBeInTheDocument()
  expect(screen.getByText('$0.011', { exact: false })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View original' })).toHaveAttribute('href', '/imports/3')
})

it('has no original link for an import from before originals were kept', async () => {
  signedIn()
  show({ ...recipe, source_import: { ...sourceImport, original_parts: 0 } })
  expect(await screen.findByText('Import cost')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'View original' })).not.toBeInTheDocument()
})

it('shows ingredient groups as headings where the group changes, with each line note', async () => {
  signedIn()
  const line = recipe.recipe_ingredients[0]
  show({
    ...recipe,
    recipe_ingredients: [
      { ...line, id: 1, group: 'Batter' },
      { ...line, id: 2, group: 'Batter', note: 'cold' },
      { ...line, id: 3, group: 'Topping' },
      { ...line, id: 4, group: null },
    ],
  })
  const headings = await screen.findAllByRole('heading', { level: 3 })
  expect(headings.map((heading) => heading.textContent)).toEqual(['Batter', 'Topping'])
  const batter = within(screen.getByRole('list', { name: 'Batter' })).getAllByRole('listitem')
  expect(batter.map((item) => item.textContent)).toEqual(['½ cup milk', '½ cup milk (cold)'])
  expect(within(screen.getByRole('list', { name: 'Topping' })).getAllByRole('listitem')).toHaveLength(1)
})

it('links to the author of a recipe without a cookbook', async () => {
  signedIn()
  show({ ...recipe, author_id: 3, author: { id: 3, name: 'Ana Roux' } })
  expect(await screen.findByRole('link', { name: 'Ana Roux' })).toHaveAttribute('href', '/authors/3')
})

it('has no import cost for a recipe typed in', async () => {
  signedIn()
  show(recipe)
  await screen.findByRole('heading', { name: 'Pancakes' })
  expect(screen.queryByText('Import cost')).not.toBeInTheDocument()
})

describe('serving scaler', () => {
  beforeEach(() => signedIn())

  it('scales amounts to the servings typed', async () => {
    const user = userEvent.setup()
    show(recipe)

    const box = await screen.findByLabelText('Servings')
    expect(amounts()).toEqual(['½ cup milk', '⅓ cup sugar'])

    await user.clear(box)
    await user.type(box, '8')
    expect(amounts()).toEqual(['1 cup milk', '⅔ cup sugar'])
  })

  it('shows "to taste" without an amount, at any servings', async () => {
    const user = userEvent.setup()
    const toTaste = { id: 9, name: 'to taste' }
    show({
      ...recipe,
      recipe_ingredients: [
        { id: 3, amount_numerator: 1, amount_denominator: 1, ingredient: { id: 3, name: 'salt' }, measurement: toTaste, preparation: null, group: null, note: null },
        {
          id: 4,
          amount_numerator: 2,
          amount_denominator: 1,
          ingredient: { id: 4, name: 'chives' },
          measurement: toTaste,
          preparation: { id: 1, name: 'minced' },
          group: null,
          note: null,
        },
      ],
    })

    const box = await screen.findByLabelText('Servings')
    expect(amounts()).toEqual(['salt, to taste', 'chives, minced, to taste'])

    await user.clear(box)
    await user.type(box, '8')
    expect(amounts()).toEqual(['salt, to taste', 'chives, minced, to taste'])
  })

  it('steps servings and marks rounded amounts', async () => {
    const user = userEvent.setup()
    show(recipe)

    await user.click(await screen.findByRole('button', { name: 'More servings' }))
    expect(screen.getByLabelText('Servings')).toHaveValue(5)
    // ½ × 5/4 = ⅝ exactly; ⅓ × 5/4 = 5/12, rounded to ⅜
    expect(amounts()).toEqual(['⅝ cup milk', '≈⅜ cup sugar'])
  })

  it('stops at one serving', async () => {
    const user = userEvent.setup()
    show({ ...recipe, servings: 2 })

    const fewer = await screen.findByRole('button', { name: 'Fewer servings' })
    await user.click(fewer)
    expect(screen.getByLabelText('Servings')).toHaveValue(1)
    expect(fewer).toBeDisabled()
  })

  it('shows unscaled amounts while the box is empty', async () => {
    const user = userEvent.setup()
    show(recipe)

    await user.clear(await screen.findByLabelText('Servings'))
    expect(amounts()).toEqual(['½ cup milk', '⅓ cup sugar'])
  })

  it('has no scaler without servings', async () => {
    show({ ...recipe, servings: null })

    expect(await screen.findByText('milk', { exact: false })).toBeInTheDocument()
    expect(screen.queryByLabelText('Servings')).not.toBeInTheDocument()
  })
})

describe('notes and source', () => {
  beforeEach(() => signedIn())

  it('shows notes with their line breaks and links the source by host', async () => {
    show({ ...recipe, notes: 'Halve the salt.\nUse brown butter.', source_url: 'https://www.example.com/pancakes' })

    const link = await screen.findByRole('link', { name: 'www.example.com' })
    expect(link).toHaveAttribute('href', 'https://www.example.com/pancakes')
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByText(/Halve the salt/).textContent).toBe('Halve the salt.\nUse brown butter.')
  })

  it('omits both when unset', async () => {
    show(recipe)

    expect(await screen.findByText('milk', { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument()
    expect(screen.queryByText('Source')).not.toBeInTheDocument()
  })
})

describe('deleting', () => {
  beforeEach(() => signedIn())

  it('shows a failed delete without leaving an unhandled rejection', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    onTestFinished(() => confirm.mockRestore())
    server.use(http.delete('/api/recipes/7', () => HttpResponse.json({ detail: 'Server unavailable' }, { status: 503 })))
    const user = userEvent.setup()
    show(recipe)

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    // Vitest fails the run on an unhandled rejection, so this also covers that.
    expect(await screen.findByText(/Server unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pancakes' })).toBeInTheDocument()
  })
})

describe('cook times', () => {
  beforeEach(() => signedIn())

  it('shows minutes as hours and minutes, including a zero inactive time', async () => {
    show({ ...recipe, active_cook_time: 75, inactive_cook_time: 0 })

    expect(await screen.findByText('1 h 15 min')).toBeInTheDocument()
    expect(screen.getByText('0 min')).toBeInTheDocument()
  })
})

it('shows the tags by name, each linking to the list filtered by it', async () => {
  signedIn()
  show({ ...recipe, tags: [{ id: 5, name: 'Sweet' }, { id: 4, name: 'Breakfast' }] })

  const tags = await screen.findByRole('list', { name: 'Tags' })
  expect(within(tags).getAllByRole('link').map((link) => link.textContent)).toEqual(['Breakfast', 'Sweet'])
  expect(within(tags).getByRole('link', { name: 'Breakfast' })).toHaveAttribute('href', '/?tag=4')
})

it('shows the photo when there is one', async () => {
  signedIn()
  show({ ...recipe, image: 'a'.repeat(32) })
  expect(await screen.findByRole('img', { name: 'Pancakes' })).toHaveAttribute('src', `/api/images/${'a'.repeat(32)}.jpg`)
})

describe('shopping list', () => {
  beforeEach(() => signedIn())

  it('adds the recipe at the servings shown', async () => {
    let body: unknown
    server.use(
      http.put('/api/shopping-list/recipes/7', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ recipes: [], lines: [] })
      }),
    )
    const user = userEvent.setup()
    show(recipe)

    const box = await screen.findByLabelText('Servings')
    await user.clear(box)
    await user.type(box, '8')
    await user.click(screen.getByRole('button', { name: 'Add to shopping list' }))
    await vi.waitFor(() => expect(body).toEqual({ servings: 8 }))
  })

  it('links to the list when the recipe is on it', async () => {
    server.use(
      http.get('/api/shopping-list', () =>
        HttpResponse.json({ recipes: [{ recipe_id: 7, name: 'Pancakes', servings: 4, recipe_servings: 4, batches: 1 }], lines: [] }),
      ),
    )
    show(recipe)
    expect(await screen.findByRole('link', { name: 'On shopping list' })).toHaveAttribute('href', '/shopping')
    expect(screen.queryByRole('button', { name: 'Add to shopping list' })).not.toBeInTheDocument()
  })
})
