import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'

import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { CreateRecipeForm } from './CreateRecipeForm'

it('saves steps in the order they were moved to', async () => {
  let sent: { steps: { text: string }[] } | undefined
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.post('/api/recipes/', async ({ request }) => {
      sent = (await request.json()) as typeof sent
      return HttpResponse.json({ id: 1 }, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.type(screen.getByLabelText('Name'), 'Soup')
  for (const text of ['Chop', 'Fry', 'Prep']) {
    await user.click(screen.getByRole('button', { name: '+ Add step' }))
    await user.type(screen.getAllByPlaceholderText('Describe this step…').at(-1)!, text)
  }
  expect(screen.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move step 3 down' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Move step 3 up' }))
  await user.click(screen.getByRole('button', { name: 'Move step 2 up' }))
  await user.click(screen.getByRole('button', { name: 'Save recipe' }))

  await waitFor(() => expect(sent?.steps.map((step) => step.text)).toEqual(['Prep', 'Chop', 'Fry']))
})

it('shows a failed save without leaving an unhandled rejection', async () => {
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.post('/api/recipes/', () => HttpResponse.json({ detail: 'Name already used' }, { status: 409 })),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.type(screen.getByLabelText('Name'), 'Soup')
  await user.click(screen.getByRole('button', { name: 'Save recipe' }))

  // Vitest fails the run on an unhandled rejection, so this also covers that.
  expect(await screen.findByText(/Name already used/)).toBeInTheDocument()
  expect(screen.getByLabelText('Name')).toHaveValue('Soup')
})

it('explains a save refused because a picked tag was deleted', async () => {
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.post('/api/recipes/', () => HttpResponse.json({ detail: 'Unknown tag ids: [3]' }, { status: 409 })),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.type(screen.getByLabelText('Name'), 'Soup')
  await user.click(screen.getByRole('button', { name: 'Save recipe' }))

  expect(await screen.findByText('A tag you picked no longer exists. Refresh and pick again.')).toBeInTheDocument()
})

it('drops the page when the cookbook is cleared', async () => {
  let sent: { cookbook_id: number | null; cookbook_page: number | null } | undefined
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([{ id: 2, name: 'Joy', author: { id: 1, name: 'Irma' } }])),
    http.post('/api/recipes/', async ({ request }) => {
      sent = (await request.json()) as typeof sent
      return HttpResponse.json({ id: 1 }, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.type(screen.getByLabelText('Name'), 'Soup')
  await user.selectOptions(screen.getByLabelText('Cookbook'), await screen.findByRole('option', { name: /Joy/ }))
  await user.type(screen.getByLabelText('Page'), '42')
  await user.selectOptions(screen.getByLabelText('Cookbook'), 'No cookbook')
  expect(screen.getByLabelText('Page')).toHaveValue(null)
  await user.click(screen.getByRole('button', { name: 'Save recipe' }))

  await waitFor(() => expect(sent).toMatchObject({ cookbook_id: null, cookbook_page: null }))
})

it('shows a newly added ingredient as picked even when the list fails to refresh', async () => {
  let listed = false
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.get('/api/measurements/', () => HttpResponse.json([])),
    http.get('/api/preparations/', () => HttpResponse.json([])),
    http.get('/api/ingredients/', () => {
      if (listed) return HttpResponse.json({ detail: 'Server unavailable' }, { status: 503 })
      listed = true
      return HttpResponse.json([])
    }),
    http.post('/api/ingredients/', () => HttpResponse.json({ id: 3, name: 'sugar' }, { status: 201 })),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
  await user.click(await screen.findByRole('button', { name: '+ New ingredient' }))
  await user.type(screen.getByLabelText('New ingredient name'), 'sugar')
  await user.click(screen.getByRole('button', { name: 'Add' }))

  await waitFor(() => expect(screen.getByLabelText('Ingredient', { exact: true })).toHaveDisplayValue('sugar'))
})

it('keeps the ingredient picker loading, not one-row, when its list never loaded', async () => {
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.get('/api/measurements/', () => HttpResponse.json([])),
    http.get('/api/preparations/', () => HttpResponse.json([])),
    http.get('/api/ingredients/', () => HttpResponse.json({ detail: 'Server unavailable' }, { status: 503 })),
    http.post('/api/ingredients/', () => HttpResponse.json({ id: 3, name: 'sugar' }, { status: 201 })),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
  await user.click(await screen.findByRole('button', { name: '+ New ingredient' }))
  await user.type(screen.getByLabelText('New ingredient name'), 'sugar')
  await user.click(screen.getByRole('button', { name: 'Add' }))

  await waitFor(() => expect(screen.queryByLabelText('New ingredient name')).not.toBeInTheDocument())
  expect(screen.getByLabelText('Ingredient', { exact: true })).toBeDisabled()
  expect(screen.queryByRole('option', { name: 'sugar' })).not.toBeInTheDocument()
})

it('adds existing and new tags, removes one, and saves the rest', async () => {
  let sent: { tag_ids: number[] } | undefined
  const tags = [{ id: 1, name: 'Dinner' }, { id: 2, name: 'Quick' }]
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.get('/api/tags/', () => HttpResponse.json(tags)),
    http.post('/api/tags/', () => {
      tags.push({ id: 9, name: 'Vegan' })
      return HttpResponse.json(tags.at(-1), { status: 201 })
    }),
    http.post('/api/recipes/', async ({ request }) => {
      sent = (await request.json()) as typeof sent
      return HttpResponse.json({ id: 1 }, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.type(screen.getByLabelText('Name'), 'Soup')
  const picker = screen.getByLabelText('Tag')
  await user.selectOptions(picker, await screen.findByRole('option', { name: 'Quick' }))
  await user.selectOptions(picker, 'Dinner')
  await user.selectOptions(picker, 'Dinner') // picking one twice keeps one
  await user.click(screen.getByRole('button', { name: '+ New tag' }))
  await user.type(screen.getByLabelText('New tag name'), 'Vegan')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  const chosen = screen.getByRole('list', { name: 'Tags' })
  await waitFor(() => expect(within(chosen).getAllByRole('listitem').map((t) => t.firstChild?.textContent)).toEqual(['Dinner', 'Quick', 'Vegan']))
  expect(picker).toHaveValue('')

  await user.click(screen.getByRole('button', { name: 'Remove tag Quick' }))
  await user.click(screen.getByRole('button', { name: 'Save recipe' }))

  await waitFor(() => expect(sent?.tag_ids).toEqual([1, 9]))
})
