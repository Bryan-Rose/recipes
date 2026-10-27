import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import App from '../App'
import { renderWithProviders } from '../test/render'
import { server, signedIn, testUser } from '../test/server'

describe('account page', () => {
  it('is linked from your name in the header', async () => {
    signedIn()
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.click(await screen.findByRole('link', { name: testUser.full_name }))
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument()
  })

  it('changes your password', async () => {
    signedIn()
    let body: unknown
    server.use(
      http.post('/api/auth/password', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/account' })

    await user.type(await screen.findByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'n3w-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'n3w-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed')
    expect(body).toEqual({ current_password: 'old-password', new_password: 'n3w-password' })
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('omits a blank current password, for SSO-only accounts', async () => {
    signedIn()
    let body: unknown
    server.use(
      http.post('/api/auth/password', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/account' })

    await user.type(await screen.findByLabelText('New password'), 'n3w-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'n3w-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    await expect.poll(() => body).toEqual({ new_password: 'n3w-password' })
  })

  it('refuses mismatched passwords without calling the API', async () => {
    signedIn()
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/account' })

    await user.type(await screen.findByLabelText('New password'), 'one-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'two-password')

    expect(screen.getByText('The new passwords don’t match.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled()
  })

  it('requires a new password of at least 8 characters', async () => {
    signedIn()
    renderWithProviders(<App />, { route: '/account' })

    // jsdom doesn't implement tooShort; e2e/tests/account.spec.ts checks the browser enforces it.
    expect(await screen.findByLabelText('New password')).toHaveAttribute('minlength', '8')
  })

  it('shows a wrong current password', async () => {
    signedIn()
    server.use(
      http.post('/api/auth/password', () =>
        HttpResponse.json({ detail: 'Current password is incorrect' }, { status: 403 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/account' })

    await user.type(await screen.findByLabelText('Current password'), 'wrong')
    await user.type(screen.getByLabelText('New password'), 'n3w-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'n3w-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
  })
})
