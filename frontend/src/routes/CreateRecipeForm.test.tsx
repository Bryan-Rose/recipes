import { screen, waitFor } from '@testing-library/react'
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
