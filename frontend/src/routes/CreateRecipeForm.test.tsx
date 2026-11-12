import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { server } from '../test/server'
import { CreateRecipeForm } from './CreateRecipeForm'

// jsdom has no canvas; a photo "converts" to its file name, and bad.heic can't be decoded.
vi.mock('../components/photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/photos')>()),
  toImageUpload: async (file: File) =>
    file.name === 'bad.heic' ? Promise.reject(new Error('decode')) : { full: `full-${file.name}`, thumb: `thumb-${file.name}` },
}))
const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

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
  // Ids out of name order, so the chips must sort by name to read Dinner, Quick, Vegan.
  const tags = [{ id: 1, name: 'Quick' }, { id: 2, name: 'Dinner' }]
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

  await waitFor(() => expect(sent?.tag_ids).toEqual([2, 9]))
})

it('keeps a name typed while a new tag is being saved', async () => {
  let release!: () => void
  const saved = new Promise<void>((resolve) => (release = resolve))
  const tags: { id: number; name: string }[] = []
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.get('/api/tags/', () => HttpResponse.json(tags)),
    http.post('/api/tags/', async () => {
      await saved
      tags.push({ id: 9, name: 'Vegan' })
      return HttpResponse.json(tags[0], { status: 201 })
    }),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.click(await screen.findByRole('button', { name: '+ New tag' }))
  await user.type(screen.getByLabelText('New tag name'), 'Vegan')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  await user.type(screen.getByLabelText('Name'), 'Lasagne')
  release()

  expect(await screen.findByRole('button', { name: 'Remove tag Vegan' })).toBeInTheDocument()
  expect(screen.getByLabelText('Name')).toHaveValue('Lasagne')
})

it('keeps an amount typed while a new ingredient is being saved', async () => {
  let release!: () => void
  const saved = new Promise<void>((resolve) => (release = resolve))
  const ingredients: { id: number; name: string }[] = []
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.get('/api/measurements/', () => HttpResponse.json([])),
    http.get('/api/preparations/', () => HttpResponse.json([])),
    http.get('/api/ingredients/', () => HttpResponse.json(ingredients)),
    http.post('/api/ingredients/', async () => {
      await saved
      const created = { id: 3, name: 'sugar' }
      ingredients.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
  await user.click(await screen.findByRole('button', { name: '+ New ingredient' }))
  await user.type(screen.getByLabelText('New ingredient name'), 'sugar')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  await user.type(screen.getByLabelText('Amount'), '2')
  release()

  await waitFor(() => expect(screen.getByLabelText('Ingredient', { exact: true })).toHaveDisplayValue('sugar'))
  expect(screen.getByLabelText('Amount')).toHaveValue(12) // the new row starts at 1
})

it('blocks a duplicate name only within the same cookbook', async () => {
  const joy = { id: 2, name: 'Joy', author: { id: 1, name: 'Irma' } }
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([joy])),
    http.get('/api/recipes/', () =>
      HttpResponse.json([{ id: 7, name: 'Soup', cookbook_id: 2, cookbook: joy, tags: [], ingredient_names: [] }]),
    ),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)

  await user.type(screen.getByLabelText('Name'), 'soup')
  const save = screen.getByRole('button', { name: 'Save recipe' })
  await waitFor(() => expect(save).toBeEnabled())
  expect(screen.queryByText(/already exists/)).not.toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText('Cookbook'), await screen.findByRole('option', { name: /Joy/ }))
  expect(screen.getByRole('link', { name: 'A recipe called “Soup”' })).toHaveAttribute('href', '/recipes/7')
  expect(screen.getByText(/already exists in Joy/)).toBeInTheDocument()
  expect(save).toBeDisabled()
})

it('saves the picked photo with the recipe, and none once removed', async () => {
  const sent: { image: unknown }[] = []
  server.use(
    http.get('/api/cookbooks/', () => HttpResponse.json([])),
    http.post('/api/recipes/', async ({ request }) => {
      sent.push((await request.json()) as { image: unknown })
      return HttpResponse.json({ detail: 'stop here' }, { status: 409 })
    }),
  )
  const user = userEvent.setup()
  renderWithProviders(<CreateRecipeForm />)
  await user.type(screen.getByLabelText('Name'), 'Soup')
  expect(screen.getByText('No photo yet.')).toBeInTheDocument()

  await user.upload(screen.getByLabelText('Add a photo'), photo('bad.heic'))
  expect(await screen.findByText('Couldn’t open bad.heic. Try a JPEG or PNG.')).toBeInTheDocument()

  await user.upload(screen.getByLabelText('Add a photo'), photo('soup.jpg'))
  expect(await screen.findByRole('img', { name: 'Recipe photo' })).toHaveAttribute('src', 'data:image/jpeg;base64,full-soup.jpg')
  expect(screen.queryByText(/Couldn’t open/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Save recipe' }))
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0].image).toEqual({ full: 'full-soup.jpg', thumb: 'thumb-soup.jpg' })

  await user.click(screen.getByRole('button', { name: 'Remove photo' }))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Save recipe' }))
  await waitFor(() => expect(sent).toHaveLength(2))
  expect(sent[1].image).toBeNull()
})
