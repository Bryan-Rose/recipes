import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import App from './App'
import { renderWithProviders } from './test/render'
import { server, signedIn, testUser } from './test/server'

describe('session gate', () => {
  it('shows the login page when signed out, whatever the route', async () => {
    renderWithProviders(<App />, { route: '/recipes/5' })

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows the app with the user in the header when signed in', async () => {
    signedIn()
    renderWithProviders(<App />)

    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
    expect(screen.getByText(testUser.full_name)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('returns to the login page when any request comes back 401', async () => {
    signedIn()
    server.use(http.get('/api/recipes/', () => HttpResponse.json({ detail: 'Not signed in' }, { status: 401 })))
    renderWithProviders(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('login page', () => {
  it('signs in with a password', async () => {
    let signedInNow = false
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        const body = (await request.json()) as { username: string; password: string }
        if (body.username !== 'cook' || body.password !== 'secret') {
          return HttpResponse.json({ detail: 'Invalid username or password' }, { status: 401 })
        }
        signedInNow = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/auth/me', () =>
        signedInNow ? HttpResponse.json(testUser) : HttpResponse.json({ detail: 'Not signed in' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.type(await screen.findByLabelText('Username'), ' cook ')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('says so on a wrong password, without signing in', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid username or password' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.type(await screen.findByLabelText('Username'), 'cook')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Wrong username or password.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the lockout message after too many failed attempts', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ detail: 'Too many failed sign-in attempts. Try again later.' }, { status: 429 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.type(await screen.findByLabelText('Username'), 'cook')
    await user.type(screen.getByLabelText('Password'), 'cook-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Too many failed sign-in attempts. Try again later.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('offers SSO with the configured name, and hides the password form when disabled', async () => {
    server.use(
      http.get('/api/auth/config', () =>
        HttpResponse.json({ password_login: false, oidc: true, oidc_display_name: 'Pocket ID' }),
      ),
    )
    renderWithProviders(<App />)

    expect(await screen.findByRole('button', { name: 'Sign in with Pocket ID' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it.each([
    ['sso_failed', 'Single sign-on failed. Please try again.'],
    ['sso_not_allowed', 'That account isn’t allowed to use this app. Ask an admin to add you.'],
  ])('explains the %s error from the SSO callback', async (code, message) => {
    renderWithProviders(<App />, { route: `/login?error=${code}` })

    expect(await screen.findByText(message)).toBeInTheDocument()
  })
})
