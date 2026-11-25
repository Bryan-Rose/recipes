import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'

import App from '../App'
import type { ImportRecord } from '../api/types'
import { renderWithProviders } from '../test/render'
import { passwordOnly, server, signedIn } from '../test/server'

const row = (id: number, created_at: string, cost_usd: number | null, extra: Partial<ImportRecord> = {}): ImportRecord => ({
  id,
  created_at,
  source: 'text',
  outcome: 'draft',
  recipe: null,
  saved: false,
  model: 'claude-sonnet-5-5',
  input_tokens: 2000,
  output_tokens: 500,
  cost_usd,
  original_parts: 1,
  page_url: null,
  ...extra,
})

// Noon UTC, so the local day is the same in any test time zone within ±11 h.
const history: ImportRecord[] = [
  row(4, '2026-11-24T12:00:00Z', 0.01, { source: 'url', recipe: { id: 7, name: 'Pancakes' }, saved: true }),
  row(5, '2026-11-24T11:00:00Z', 0.01, { saved: true }),
  row(3, '2026-11-23T12:00:00Z', null, { model: 'claude-future-9' }),
  row(2, '2026-11-20T12:00:00Z', 0.02, { source: 'photos', outcome: 'no_draft' }),
  row(1, '2026-10-30T12:00:00Z', 0.005, { outcome: 'cut_off', original_parts: 0 }),
]

const rows = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((cell) => cell.textContent))

beforeEach(() => {
  signedIn()
  server.use(http.get('/api/auth/config', () => HttpResponse.json({ ...passwordOnly, recipe_import: true })))
})

it('totals imports by week and month, counting unpriced ones apart', async () => {
  server.use(http.get('/api/imports/', () => HttpResponse.json(history)))
  renderWithProviders(<App />, { route: '/import-costs' })

  await screen.findByRole('heading', { name: 'Import costs' })
  const week = (iso: string) =>
    `Week of ${new Date(`${iso}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
  expect(rows('By week')).toEqual([
    [week('2026-11-23'), '3', '$0.020 + 1 unpriced'],
    [week('2026-11-16'), '1', '$0.020'],
    [week('2026-10-26'), '1', '$0.005'],
  ])
  const month = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  expect(rows('By month')).toEqual([
    [month('2026-11-01'), '4', '$0.040 + 1 unpriced'],
    [month('2026-10-01'), '1', '$0.005'],
  ])
})

it('lists each import with the recipe saved from it, or why there is none', async () => {
  server.use(http.get('/api/imports/', () => HttpResponse.json(history)))
  renderWithProviders(<App />, { route: '/import-costs' })

  expect(await screen.findByRole('link', { name: 'Pancakes' })).toHaveAttribute('href', '/recipes/7')
  expect(rows('Imports')).toEqual([
    ['2026-11-24', 'Link', 'Pancakes', 'claude-sonnet-5-5', '2,000 / 500', '$0.010', 'View original'],
    ['2026-11-24', 'Text', 'Recipe deleted', 'claude-sonnet-5-5', '2,000 / 500', '$0.010', 'View original'],
    ['2026-11-23', 'Text', 'Not saved', 'claude-future-9', '2,000 / 500', 'unknown', 'View original'],
    ['2026-11-20', 'Photos', 'No recipe found', 'claude-sonnet-5-5', '2,000 / 500', '$0.020', 'View original'],
    ['2026-10-30', 'Text', 'Too long', 'claude-sonnet-5-5', '2,000 / 500', '$0.005', ''],
  ])
  expect(screen.getAllByRole('link', { name: 'View original' })[3]).toHaveAttribute('href', '/imports/2')
})

it('says when nothing has been imported', async () => {
  server.use(http.get('/api/imports/', () => HttpResponse.json([])))
  renderWithProviders(<App />, { route: '/import-costs' })
  expect(await screen.findByText('No recipes imported yet.')).toBeInTheDocument()
})

it('links to the page from the header only when import is set up', async () => {
  server.use(http.get('/api/imports/', () => HttpResponse.json([])))
  renderWithProviders(<App />, { route: '/import-costs' })
  expect(await screen.findByRole('link', { name: 'Import costs' })).toHaveAttribute('href', '/import-costs')
})

it('hides the header link when import is off', async () => {
  server.use(
    http.get('/api/auth/config', () => HttpResponse.json(passwordOnly)),
    http.get('/api/imports/', () => HttpResponse.json([])),
  )
  renderWithProviders(<App />, { route: '/import-costs' })
  await screen.findByText('No recipes imported yet.')
  expect(screen.queryByRole('link', { name: 'Import costs' })).not.toBeInTheDocument()
})
