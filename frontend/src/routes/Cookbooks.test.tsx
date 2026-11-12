import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../App'
import type { Cookbook, Recipe, RecipeSummary } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const julia = { id: 1, name: 'Julia Child' }
const jacques = { id: 2, name: 'Jacques Pépin' }
const mastering: Cookbook = { id: 5, name: 'Mastering', created_at: '2026-01-01T00:00:00Z', author: julia, recipe_count: 3 }
const french: Cookbook = { id: 6, name: 'French Chef', created_at: '2026-01-01T00:00:00Z', author: julia, recipe_count: 0 }
const fast: Cookbook = { id: 7, name: 'Fast Food My Way', created_at: '2026-01-01T00:00:00Z', author: jacques, recipe_count: 0 }

function recipe(id: number, name: string, cookbook: Cookbook | null, page: number | null): RecipeSummary {
  return {
    id,
    name,
    cookbook_id: cookbook?.id ?? null,
    cookbook_page: page,
    cookbook,
    active_cook_time: null,
    inactive_cook_time: null,
    created_at: '2026-01-01T00:00:00Z',
    tags: [],
    ingredient_names: [],
    step_count: 0,
    image: null,
  }
}

/** The full recipe GET /recipes/{id} returns for a list row. */
function detail(summary: RecipeSummary): Recipe {
  return { ...summary, created_user_id: 1, updated_at: summary.created_at, steps: [], requirements: [], recipe_ingredients: [] }
}

const recipes = [
  recipe(1, 'Boeuf', mastering, 315),
  recipe(2, 'Omelette', mastering, 126),
  recipe(3, 'Aspic', mastering, null),
  recipe(4, 'Toast', null, null),
]

beforeEach(() => {
  signedIn()
  server.use(
    http.get('/api/recipes/', () => HttpResponse.json(recipes)),
    http.get('/api/cookbooks/', () => HttpResponse.json([mastering, french, fast])),
    http.get('/api/authors/', () => HttpResponse.json([julia, jacques])),
  )
})

const rows = (list: string) =>
  within(screen.getByRole('list', { name: list }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

describe('browsing by cookbook', () => {
  it('lists every cookbook from the header link', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/' })

    await user.click(await screen.findByRole('link', { name: 'Cookbooks' }))

    expect(await screen.findByRole('heading', { name: 'Cookbooks' })).toBeInTheDocument()
    expect(rows('Cookbooks')).toEqual([
      'Fast Food My Way by Jacques Pépin · 0 recipes',
      'French Chef by Julia Child · 0 recipes',
      'Mastering by Julia Child · 3 recipes',
    ])
  })

  it('says so when there are no cookbooks', async () => {
    server.use(http.get('/api/cookbooks/', () => HttpResponse.json([])))
    renderWithProviders(<App />, { route: '/cookbooks' })
    const empty = await screen.findByText(/No cookbooks yet/)
    expect(within(empty).getByRole('link', { name: 'Lookups' })).toHaveAttribute('href', '/lookups/cookbooks')
  })

  it('goes from a recipe card to its cookbook, listed by page', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/' })

    await user.click((await screen.findAllByRole('link', { name: 'Mastering' }))[0])

    expect(await screen.findByRole('heading', { name: 'Mastering' })).toBeInTheDocument()
    // Unpaged recipes come last.
    expect(rows('Recipes in Mastering')).toEqual(['p. 126Omelette', 'p. 315Boeuf', '—Aspic'])
    server.use(http.get('/api/recipes/2', () => HttpResponse.json(detail(recipes[1]))))
    await user.click(screen.getByRole('link', { name: 'Omelette' }))
    expect(await screen.findByRole('heading', { name: 'Omelette' })).toBeInTheDocument()
  })

  it('goes from a recipe card to its author, with each of their cookbooks', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/' })

    await user.click((await screen.findAllByRole('link', { name: 'Julia Child' }))[0])

    expect(await screen.findByRole('heading', { name: 'Julia Child' })).toBeInTheDocument()
    expect(screen.queryByText('Fast Food My Way')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'French Chef' })).getByText('No recipes from this cookbook yet.')).toBeInTheDocument()
    expect(rows('Recipes in Mastering')).toHaveLength(3)
  })

  it('links the cookbook and author from the recipe page', async () => {
    server.use(http.get('/api/recipes/1', () => HttpResponse.json(detail(recipes[0]))))
    renderWithProviders(<App />, { route: '/recipes/1' })

    expect(await screen.findByRole('link', { name: 'Mastering' })).toHaveAttribute('href', '/cookbooks/5')
    expect(screen.getByRole('link', { name: 'Julia Child' })).toHaveAttribute('href', '/authors/1')
  })

  it('says so for an unknown cookbook', async () => {
    renderWithProviders(<App />, { route: '/cookbooks/99' })
    expect(await screen.findByRole('heading', { name: 'No such cookbook' })).toBeInTheDocument()
  })

  it('says so for an unknown author', async () => {
    renderWithProviders(<App />, { route: '/authors/99' })
    expect(await screen.findByRole('heading', { name: 'No such author' })).toBeInTheDocument()
  })

  it('says so for an author without cookbooks', async () => {
    server.use(http.get('/api/authors/', () => HttpResponse.json([{ id: 3, name: 'Nobody' }])))
    renderWithProviders(<App />, { route: '/authors/3' })
    expect(await screen.findByText('No cookbooks by Nobody yet.')).toBeInTheDocument()
  })
})
