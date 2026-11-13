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
const mastering: Cookbook = { id: 5, name: 'Mastering', created_at: '2026-01-01T00:00:00', author: julia, recipe_count: 3, image: null }
const empty: Cookbook = { ...mastering, id: 6, name: 'Empty Book', recipe_count: 0 }

// jsdom has no canvas; a photo "converts" to its file name.
vi.mock('../components/photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/photos')>()),
  toImageUpload: async (file: File) => ({ full: `full-${file.name}`, thumb: `thumb-${file.name}` }),
}))

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
      http.get('/api/authors/', () => HttpResponse.json([julia])),
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

  it('uploads, shows and removes a cookbook cover', async () => {
    const cover = 'c'.repeat(32)
    let current: Cookbook = mastering
    let sent: unknown
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([current])),
      http.get('/api/authors/', () => HttpResponse.json([julia])),
      http.put('/api/cookbooks/5/image', async ({ request }) => {
        sent = await request.json()
        current = { ...mastering, image: cover }
        return HttpResponse.json(current)
      }),
      http.delete('/api/cookbooks/5/image', () => {
        current = mastering
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    show('/lookups/cookbooks')

    const row = within(await screen.findByRole('listitem', { name: 'Mastering' }))
    await user.click(row.getByRole('button', { name: 'Edit' }))
    await user.upload(row.getByLabelText('Add a photo'), new File(['x'], 'book.jpg', { type: 'image/jpeg' }))

    expect(await row.findByRole('img', { name: 'Cookbook cover' })).toHaveAttribute('src', `/api/images/${cover}.jpg`)
    expect(sent).toEqual({ full: 'full-book.jpg', thumb: 'thumb-book.jpg' })
    await user.click(row.getByRole('button', { name: 'Remove photo' }))
    expect(await row.findByText('No photo yet.')).toBeInTheDocument()
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
      image: null,
    }
    let count = 1
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([{ ...mastering, recipe_count: count }])),
      http.get('/api/authors/', () => HttpResponse.json([julia])),
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

  it('adds a cookbook by an existing author', async () => {
    let posted: unknown
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json(posted ? [mastering] : [])),
      http.get('/api/authors/', () => HttpResponse.json([julia, jacques])),
      http.post('/api/cookbooks/', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(mastering, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    show('/lookups/cookbooks')

    const form = within(await screen.findByRole('form', { name: 'Add a cookbook' }))
    await user.type(form.getByLabelText('Name'), ' Mastering ')
    expect(form.getByRole('button', { name: 'Add cookbook' })).toBeDisabled() // no author yet
    await user.selectOptions(form.getByLabelText('Author'), await form.findByRole('option', { name: julia.name }))
    await user.click(form.getByRole('button', { name: 'Add cookbook' }))

    await expect.poll(() => posted).toEqual({ name: 'Mastering', author_id: julia.id })
    expect(await screen.findByRole('listitem', { name: 'Mastering' })).toBeInTheDocument()
    await waitFor(() => expect(form.getByLabelText('Name')).toHaveValue(''))
  })

  it('adds a cookbook by a new author', async () => {
    const newAuthor = { id: 9, name: 'Madhur Jaffrey' }
    let created = false
    let posted: unknown
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([])),
      http.get('/api/authors/', () => HttpResponse.json(created ? [julia, newAuthor] : [julia])),
      http.post('/api/authors/', () => {
        created = true
        return HttpResponse.json(newAuthor, { status: 201 })
      }),
      http.post('/api/cookbooks/', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json({ ...mastering, name: 'Indian Cookery', author: newAuthor }, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    show('/lookups/cookbooks')

    const form = within(await screen.findByRole('form', { name: 'Add a cookbook' }))
    await user.type(form.getByLabelText('Name'), 'Indian Cookery')
    await user.click(await form.findByRole('button', { name: '+ New author' }))
    await user.type(form.getByLabelText('New author name'), `${newAuthor.name}{Enter}`)
    await waitFor(() => expect(form.getByLabelText('Author')).toHaveValue(String(newAuthor.id)))
    await user.click(form.getByRole('button', { name: 'Add cookbook' }))

    await expect.poll(() => posted).toEqual({ name: 'Indian Cookery', author_id: newAuthor.id })
  })

  it('explains a cookbook name the author already has', async () => {
    server.use(
      http.get('/api/cookbooks/', () => HttpResponse.json([mastering])),
      http.get('/api/authors/', () => HttpResponse.json([julia])),
      http.post('/api/cookbooks/', () => HttpResponse.json({ detail: 'Already exists' }, { status: 409 })),
    )
    const user = userEvent.setup()
    show('/lookups/cookbooks')

    const form = within(await screen.findByRole('form', { name: 'Add a cookbook' }))
    await user.type(form.getByLabelText('Name'), 'Mastering')
    await user.selectOptions(form.getByLabelText('Author'), await form.findByRole('option', { name: julia.name }))
    await user.click(form.getByRole('button', { name: 'Add cookbook' }))

    expect(await form.findByText('That author already has a cookbook with this name.')).toBeInTheDocument()
  })
})
