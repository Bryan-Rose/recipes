import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'

import App from '../App'
import type { ImportDetail } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const detail: ImportDetail = {
  id: 3,
  created_at: '2026-11-24T12:00:00Z',
  source: 'text',
  outcome: 'draft',
  recipe: { id: 7, name: 'Pancakes' },
  saved: true,
  model: 'claude-sonnet-5-5',
  input_tokens: 2000,
  output_tokens: 500,
  cost_usd: 0.01,
  original_parts: 1,
  page_url: null,
  text: 'Pancakes\n2 cups flour',
}

function show(data: ImportDetail) {
  server.use(http.get('/api/imports/3', () => HttpResponse.json(data)))
  renderWithProviders(<App />, { route: '/imports/3' })
}

beforeEach(() => signedIn())

it('shows the pasted text and the recipe saved from it', async () => {
  show(detail)
  expect(await screen.findByRole('heading', { name: 'Original import' })).toBeInTheDocument()
  expect(screen.getByText(/2 cups flour/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Pancakes' })).toHaveAttribute('href', '/recipes/7')
})

it('shows each photo in page order', async () => {
  show({ ...detail, source: 'photos', original_parts: 2, text: null })
  expect(await screen.findByRole('img', { name: 'Page 1' })).toHaveAttribute('src', '/api/imports/3/original/0')
  expect(screen.getByRole('img', { name: 'Page 2' })).toHaveAttribute('src', '/api/imports/3/original/1')
})

it('links to the page and to its HTML as downloaded', async () => {
  show({ ...detail, source: 'url', recipe: null, saved: false, page_url: 'https://example.com/pancakes', text: null })
  expect(await screen.findByRole('link', { name: 'https://example.com/pancakes' })).toHaveAttribute(
    'href',
    'https://example.com/pancakes',
  )
  expect(screen.getByRole('link', { name: "The page's HTML" })).toHaveAttribute('href', '/api/imports/3/original/0')
  expect(screen.getByText(/not saved/)).toBeInTheDocument()
})

it('says when an import is from before originals were kept', async () => {
  show({ ...detail, original_parts: 0, text: null })
  expect(await screen.findByText('This import is from before originals were kept.')).toBeInTheDocument()
})
