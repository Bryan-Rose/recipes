import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../App'
import type { Cookbook, Recipe } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const author = { id: 1, name: 'Julia Child' }
const mastering: Cookbook = { id: 5, name: 'Mastering', created_at: '2026-01-01T00:00:00Z', author, recipe_count: 2 }
const baking: Cookbook = { id: 6, name: 'Baking', created_at: '2026-01-01T00:00:00Z', author, recipe_count: 1 }

function recipe(id: number, name: string, extra: Partial<Recipe>): Recipe {
  return {
    id,
    name,
    created_user_id: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    steps: [],
    requirements: [],
    tags: [],
    recipe_ingredients: [],
    ...extra,
  }
}

const dinner = { id: 1, name: 'Dinner' }
const quick = { id: 2, name: 'Quick' }

const recipes = [
  recipe(1, 'Stew', { cookbook: mastering, tags: [dinner], active_cook_time: 30, inactive_cook_time: 120, created_at: '2026-03-01T00:00:00Z' }),
  recipe(2, 'Bread', { cookbook: baking, active_cook_time: 20, inactive_cook_time: 180, created_at: '2026-02-01T00:00:00Z' }),
  recipe(3, 'Omelette', { cookbook: mastering, tags: [quick, dinner], active_cook_time: 10, created_at: '2026-01-01T00:00:00Z' }),
  recipe(4, 'Toast', { created_at: '2026-04-01T00:00:00Z' }),
]

beforeEach(() => {
  signedIn()
  server.use(http.get('/api/recipes/', () => HttpResponse.json(recipes)))
})

const names = () =>
  within(screen.getByRole('list', { name: 'Recipes' }))
    .getAllByRole('link')
    .filter((link) => link.className === 'recipe-card__title')
    .map((link) => link.textContent)

describe('recipe list', () => {
  it('sorts by name by default and shows times in hours and minutes', async () => {
    renderWithProviders(<App />)

    expect(await screen.findByRole('link', { name: 'Stew' })).toBeInTheDocument()
    expect(names()).toEqual(['Bread', 'Omelette', 'Stew', 'Toast'])
    expect(screen.getByText('2 h 30 min total')).toBeInTheDocument()
    expect(screen.getByText('10 min active')).toBeInTheDocument()
  })

  it.each([
    ['Recently added', ['Toast', 'Stew', 'Bread', 'Omelette']],
    ['Active time', ['Omelette', 'Bread', 'Stew', 'Toast']],
    ['Total time', ['Omelette', 'Stew', 'Bread', 'Toast']],
  ])('sorts by %s, recipes without a time last', async (sort, expected) => {
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Sort by' }), sort)

    expect(names()).toEqual(expected)
  })

  it('filters by cookbook, together with the search', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)

    const cookbook = await screen.findByRole('combobox', { name: 'Cookbook' })
    expect(within(cookbook).getAllByRole('option').map((o) => o.textContent)).toEqual(['All cookbooks', 'Baking', 'Mastering'])
    await user.selectOptions(cookbook, 'Mastering')
    expect(names()).toEqual(['Omelette', 'Stew'])

    await user.type(screen.getByRole('textbox', { name: 'Search recipes' }), 'om')
    expect(names()).toEqual(['Omelette'])

    await user.clear(screen.getByRole('textbox', { name: 'Search recipes' }))
    await user.type(screen.getByRole('textbox', { name: 'Search recipes' }), 'bread')
    expect(screen.getByText('Nothing matches “bread”.')).toBeInTheDocument()
  })

  it('shows tags on cards and filters by tag, also from a tag link', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />)

    const stewTags = await screen.findByRole('list', { name: 'Stew tags' })
    expect(within(stewTags).getByRole('link', { name: 'Dinner' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Toast tags' })).not.toBeInTheDocument()
    // Sorted by name, whatever order the API sent.
    expect(within(screen.getByRole('list', { name: 'Omelette tags' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['Dinner', 'Quick'])

    const tag = screen.getByRole('combobox', { name: 'Tag' })
    expect(within(tag).getAllByRole('option').map((o) => o.textContent)).toEqual(['All tags', 'Dinner', 'Quick'])
    await user.selectOptions(tag, 'Dinner')
    expect(names()).toEqual(['Omelette', 'Stew'])

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cookbook' }), 'Baking')
    expect(screen.getByText('No recipes match these filters.')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cookbook' }), 'All cookbooks')
    await user.click(within(screen.getByRole('list', { name: 'Omelette tags' })).getByRole('link', { name: 'Quick' }))
    expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveValue('2')
    expect(names()).toEqual(['Omelette'])
  })

  it('reads the view from the URL', async () => {
    renderWithProviders(<App />, { route: '/?sort=active&cookbook=5&q=e' })

    expect(await screen.findByRole('combobox', { name: 'Sort by' })).toHaveValue('active')
    expect(screen.getByRole('combobox', { name: 'Cookbook' })).toHaveValue('5')
    expect(screen.getByRole('textbox', { name: 'Search recipes' })).toHaveValue('e')
    expect(names()).toEqual(['Omelette', 'Stew'])
  })

  it('ignores an unknown sort, cookbook or tag in the URL', async () => {
    renderWithProviders(<App />, { route: '/?sort=nope&cookbook=99&tag=99' })

    expect(await screen.findByRole('combobox', { name: 'Cookbook' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('name')
    expect(names()).toEqual(['Bread', 'Omelette', 'Stew', 'Toast'])
  })
})
