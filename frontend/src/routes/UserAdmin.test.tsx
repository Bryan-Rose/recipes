import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import App from '../App'
import type { User } from '../api/types'
import { renderWithProviders } from '../test/render'
import { server, signedIn, testUser } from '../test/server'

const admin: User = { ...testUser, id: 1, username: 'boss', full_name: 'The Boss', is_superuser: true }
const cook: User = { ...testUser, id: 2 }

describe('user admin', () => {
  it('is hidden from non-admins', async () => {
    signedIn(cook)
    renderWithProviders(<App />, { route: '/users' })

    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('lists users and keeps admins from locking themselves out', async () => {
    signedIn(admin)
    server.use(http.get('/api/users/', () => HttpResponse.json([admin, cook])))
    renderWithProviders(<App />, { route: '/users' })

    const me = within(await screen.findByRole('listitem', { name: 'boss' }))
    expect(me.getByRole('checkbox', { name: 'Active' })).toBeDisabled()
    expect(me.getByRole('checkbox', { name: 'Admin' })).toBeDisabled()
    expect(me.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    const other = within(screen.getByRole('listitem', { name: 'cook' }))
    expect(other.getByRole('checkbox', { name: 'Active' })).toBeEnabled()
    expect(other.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('toggles admin and resets a password', async () => {
    signedIn(admin)
    const patches: unknown[] = []
    server.use(
      http.get('/api/users/', () => HttpResponse.json([admin, cook])),
      http.patch('/api/users/2', async ({ request }) => {
        patches.push(await request.json())
        return HttpResponse.json(cook)
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/users' })

    const row = within(await screen.findByRole('listitem', { name: 'cook' }))
    await user.click(row.getByRole('checkbox', { name: 'Admin' }))
    await user.click(row.getByRole('button', { name: 'Edit' }))
    await user.type(row.getByLabelText('New password'), 'n3w-password')
    await user.click(row.getByRole('button', { name: 'Save' }))

    await expect.poll(() => patches).toEqual([
      { is_superuser: true },
      { full_name: cook.full_name, password: 'n3w-password' },
    ])
  })

  it('creates a user', async () => {
    signedIn(admin)
    let created: unknown
    server.use(
      http.get('/api/users/', () => HttpResponse.json([admin])),
      http.post('/api/users/', async ({ request }) => {
        created = await request.json()
        return HttpResponse.json(cook, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/users' })

    const form = within(await screen.findByRole('form', { name: 'Add a user' }))
    await user.type(form.getByLabelText('Username'), ' julia ')
    await user.type(form.getByLabelText('Full name'), 'Julia Child')
    await user.type(form.getByLabelText('Password'), 's3cret-pw')
    await user.click(form.getByRole('checkbox', { name: 'Admin' }))
    await user.click(form.getByRole('button', { name: 'Add user' }))

    await expect.poll(() => created).toEqual({
      username: 'julia',
      full_name: 'Julia Child',
      password: 's3cret-pw',
      is_superuser: true,
    })
    await expect.poll(() => form.getByLabelText('Username')).toHaveValue('')
  })
})
