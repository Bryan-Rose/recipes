import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import App from '../App'
import type { Cookbook, Recipe, RecipeSummary } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn } from '../test/server'

const julia = { id: 1, name: 'Julia Child' }
const jacques = { id: 2, name: 'Jacques Pépin' }
const mastering: Cookbook = { id: 5, name: 'Mastering', created_at: '2026-01-01T00:00:00', author: julia, recipe_count: 3 }
const empty: Cookbook = { ...mastering, id: 6, name: 'Empty Book', recipe_count: 0 }

function mockConfirm(answer: boolean) {
  const spy = vi.spyOn(window, 'confirm').mockReturnValue(answer)
  onTestFinished(() => spy.mockRestore())
  return spy
}

function show(route: string) {
  signedIn()
  renderWithProviders(<App />, { route })
}

describe('lookups', () => {
  it('is linked from the header and opens on ingredients', async () => {
    server.use(http.get('/api/ingredients/', () => HttpResponse.json([{ id: 1, name: 'flour' }])))
    const user = userEvent.setup()
    show('/')

    await user.click(await screen.findByRole('link', { name: 'Lookups' }))

    expect(await screen.findByRole('listitem', { name: 'flour' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ingredients' })).toHaveAttribute('aria-current', 'page')
  })

  it('renames a row', async () => {
    let patched: unknown
    server.use(
      http.get('/api/measurements/', () => HttpResponse.json([{ id: 3, name: 'tbps' }])),
      http.patch('/api/measurements/3', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json({ id: 3, name: 'tbsp' })
      }),
    )
    const user = userEvent.setup()
    show('/lookups/measurements')

    const row = within(await screen.findByRole('listitem', { name: 'tbps' }))
    await user.click(row.getByRole('button', { name: 'Edit' }))
    await user.clear(row.getByLabelText('Name'))
    await user.type(row.getByLabelText('Name'), ' tbsp ')
    await user.click(row.getByRole('button', { name: 'Save' }))

    await expect.poll(() => patched).toEqual({ name: 'tbsp' })
    // The editor closes once the save's refetch settles, which can trail the PATCH.
    await waitFor(() => expect(row.queryByLabelText('Name')).not.toBeInTheDocument())
  })

  it('explains a duplicate name', async () => {
    server.use(
      http.get('/api/authors/', () => HttpResponse.json([julia, jacques])),
      http.patch('/api/authors/2', () => HttpResponse.json({ detail: 'Already exists' }, { status: 409 })),
    )
    const user = userEvent.setup()
    show('/lookups/authors')

    const row = within(await screen.findByRole('listitem', { name: jacques.name }))
    await user.click(row.getByRole('button', { name: 'Edit' }))
    await user.clear(row.getByLabelText('Name'))
    await user.type(row.getByLabelText('Name'), julia.name)
    await user.click(row.getByRole('button', { name: 'Save' }))

    expect(await row.findByText('Another one is already called “Julia Child”.')).toBeInTheDocument()
  })

  it('explains why a row in use cannot be deleted', async () => {
    mockConfirm(true)
    server.use(
      http.get('/api/authors/', () => HttpResponse.json([julia])),
      http.delete('/api/authors/1', () =>
        HttpResponse.json({ detail: "Still in use, or refers to something that doesn't exist" }, { status: 409 }),
      ),
    )
    const user = userEvent.setup()
    show('/lookups/authors')

    const row = within(await screen.findByRole('listitem', { name: julia.name }))
    await user.click(row.getByRole('button', { name: 'Delete' }))

    expect(await row.findByText('It’s still used by a cookbook, so it can’t be deleted.')).toBeInTheDocument()
  })

  it('warns that deleting a tag removes it from recipes', async () => {
    const confirm = mockConfirm(true)
    let deleted = false
    server.use(
      http.get('/api/tags/', () => HttpResponse.json(deleted ? [] : [{ id: 4, name: 'weeknight' }])),
      http.delete('/api/tags/4', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    show('/lookups/tags')

    await user.click(within(await screen.findByRole('listitem', { name: 'weeknight' })).getByRole('button', { name: 'Delete' }))

    expect(confirm).toHaveBeenCalledWith(
      'Delete “weeknight”? It will be removed from every recipe that has it. This cannot be undone.',
    )
    expect(await screen.findByText('No tags yet.')).toBeInTheDocument()
  })

  it('names the recipes a cookbook delete affects, and cancelling keeps it', async () => {
    const confirm = mockConfirm(false)
    let deletes = 0
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([mastering, empty])),
      http.delete('/api/cookbooks/:id', () => {
        deletes++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    show('/lookups/cookbooks')

    const row = within(await screen.findByRole('listitem', { name: 'Mastering' }))
    expect(row.getByText(/Julia Child · 3 recipes/)).toBeInTheDocument()
    await user.click(row.getByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenLastCalledWith(
      '3 recipes use “Mastering”. They’ll keep their content but lose this cookbook and their page numbers. Delete anyway?',
    )

    await user.click(within(screen.getByRole('listitem', { name: 'Empty Book' })).getByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenLastCalledWith('Delete “Empty Book”? This cannot be undone.')
    expect(deletes).toBe(0)
  })

  it('renames a cookbook and changes its author', async () => {
    let patched: unknown
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([mastering])),
      http.get('/api/authors/', () => HttpResponse.json([julia, jacques])),
      http.patch('/api/cookbooks/5', async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json(mastering)
      }),
    )
    const user = userEvent.setup()
    show('/lookups/cookbooks')

    const row = within(await screen.findByRole('listitem', { name: 'Mastering' }))
    await user.click(row.getByRole('button', { name: 'Edit' }))
    await user.type(row.getByLabelText('Name'), ' Vol. 1')
    await user.selectOptions(row.getByLabelText('Author'), await row.findByRole('option', { name: jacques.name }))
    await user.click(row.getByRole('button', { name: 'Save' }))

    await expect.poll(() => patched).toEqual({ name: 'Mastering Vol. 1', author_id: jacques.id })
  })

  it('refreshes a cached recipe count after a recipe is deleted', async () => {
    mockConfirm(true)
    const recipe: Recipe = {
      id: 7,
      name: 'Boeuf',
      created_user_id: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      steps: [],
      requirements: [],
      tags: [],
      recipe_ingredients: [],
      cookbook_id: mastering.id,
      cookbook: mastering,
    }
    const summary: RecipeSummary = {
      ...recipe,
      cookbook_id: mastering.id,
      cookbook_page: null,
      active_cook_time: null,
      inactive_cook_time: null,
      cookbook: mastering,
      ingredient_names: [],
      step_count: 0,
    }
    let count = 1
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([{ ...mastering, recipe_count: count }])),
      http.get('/api/recipes/', () => HttpResponse.json(count ? [summary] : [])),
      http.get('/api/recipes/7', () => HttpResponse.json(recipe)),
      http.get('/api/ingredients/', () => HttpResponse.json([])),
      http.delete('/api/recipes/7', () => {
        count = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    show('/lookups/cookbooks')
    expect(await screen.findByText(/1 recipe$/)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Recipes' }))
    await user.click(await screen.findByRole('link', { name: /Boeuf/ }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('link', { name: 'Lookups' }))
    await user.click(within(await screen.findByRole('navigation', { name: 'Lookup types' })).getByRole('link', { name: 'Cookbooks' }))

    expect(await screen.findByText(/0 recipes$/)).toBeInTheDocument()
  })
})
