import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'

import App from '../App'
import type { PlannedMeal, RecipeSummary } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const summary = (id: number, name: string): RecipeSummary => ({
  id,
  name,
  cookbook_id: null,
  author_id: null,
  cookbook_page: null,
  cookbook: null,
  active_cook_time: null,
  inactive_cook_time: null,
  created_at: '2026-01-01T00:00:00Z',
  tags: [],
  ingredient_names: [],
  step_count: 0,
  image: null,
})

const meals: PlannedMeal[] = [
  { id: 1, day: '2026-11-23', recipe_id: 7, name: 'Pancakes', servings: null, recipe_servings: 4 },
  { id: 2, day: '2026-11-25', recipe_id: 8, name: 'Toast', servings: null, recipe_servings: null },
]

const label = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })

/** Serves `meals` for any range, and records each GET's range and every write as "METHOD path [body]". */
function show(route = '/plan?week=2026-11-26') {
  const ranges: string[] = []
  const writes: string[] = []
  const record = async ({ request }: { request: Request }) => {
    const body = await request.text()
    writes.push(`${request.method} ${new URL(request.url).pathname}${body ? ` ${body}` : ''}`)
    return request.method === 'DELETE' ? new HttpResponse(null, { status: 204 }) : HttpResponse.json({})
  }
  server.use(
    http.get('/api/meal-plan/meals', ({ request }) => {
      ranges.push(new URL(request.url).search)
      return HttpResponse.json(meals)
    }),
    http.get('/api/recipes/', () => HttpResponse.json([summary(8, 'Toast'), summary(7, 'Pancakes')])),
    http.post('/api/meal-plan/*', record),
    http.put('/api/meal-plan/*', record),
    http.delete('/api/meal-plan/*', record),
  )
  renderWithProviders(<App />, { route })
  return { ranges, writes }
}

beforeEach(() => signedIn())

it('shows the week from Monday with its meals by day', async () => {
  const { ranges } = show()
  const monday = await screen.findByRole('list', { name: `Meals on ${label('2026-11-23')}` })
  expect(within(monday).getByRole('link', { name: 'Pancakes' })).toHaveAttribute('href', '/recipes/7')
  expect(within(screen.getByRole('list', { name: `Meals on ${label('2026-11-25')}` })).getByText('Toast')).toBeInTheDocument()
  expect(screen.getAllByText('Nothing planned.')).toHaveLength(5)
  expect(ranges).toContain('?start=2026-11-23&end=2026-11-29')
  // Only a recipe written for a servings count can be scaled.
  expect(screen.getByLabelText(`Servings of Pancakes on ${label('2026-11-23')}`)).toHaveValue(4)
  expect(screen.queryByLabelText(`Servings of Toast on ${label('2026-11-25')}`)).not.toBeInTheDocument()
})

it('plans, rescales and removes meals', async () => {
  const user = userEvent.setup()
  const { writes } = show()
  await user.selectOptions(await screen.findByLabelText('Recipe'), 'Toast')
  await user.selectOptions(screen.getByLabelText('Day'), label('2026-11-27'))
  await user.click(screen.getByRole('button', { name: 'Plan it' }))

  const servings = screen.getByLabelText(`Servings of Pancakes on ${label('2026-11-23')}`)
  await user.clear(servings)
  await user.type(servings, '6')
  await user.tab()
  await user.click(screen.getByRole('button', { name: `Remove Toast from ${label('2026-11-25')}` }))

  expect(writes).toEqual([
    'POST /api/meal-plan/meals {"recipe_id":8,"day":"2026-11-27","servings":null}',
    'PUT /api/meal-plan/meals/1 {"servings":6}',
    'DELETE /api/meal-plan/meals/2',
  ])
})

it('adds the week to the shopping list', async () => {
  const user = userEvent.setup()
  const { writes } = show()
  await user.click(await screen.findByRole('button', { name: 'Add week to shopping list' }))
  expect(await screen.findByText(/Added the week's meals/)).toBeInTheDocument()
  expect(writes).toEqual(['POST /api/meal-plan/shop {"start":"2026-11-23","end":"2026-11-29"}'])
})

it('moves between weeks', async () => {
  const user = userEvent.setup()
  const { ranges } = show()
  await user.click(await screen.findByRole('button', { name: 'Next week →' }))
  expect(await screen.findByRole('heading', { name: label('2026-11-30') })).toBeInTheDocument()
  expect(ranges).toContain('?start=2026-11-30&end=2026-12-06')
  await user.click(screen.getByRole('button', { name: '← Previous week' }))
  await user.click(screen.getByRole('button', { name: '← Previous week' }))
  expect(await screen.findByRole('heading', { name: label('2026-11-16') })).toBeInTheDocument()
})
