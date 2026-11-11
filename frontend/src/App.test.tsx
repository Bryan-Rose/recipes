import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import App from './App'
import type { Recipe } from './api/types'
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
        HttpResponse.json({ password_login: false, oidc: true, oidc_display_name: 'Pocket ID', recipe_import: false }),
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

describe('signing out', () => {
  const recipe: Recipe = {
    id: 7,
    name: 'Soup',
    created_user_id: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    steps: [],
    requirements: [],
    recipe_ingredients: [],
    tags: [],
  }

  function setup(answer: boolean) {
    signedIn()
    let loggedOut = 0
    server.use(
      http.post('/api/auth/logout', () => {
        loggedOut++
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/recipes/7', () => HttpResponse.json(recipe)),
      http.get('/api/cookbooks/', () => HttpResponse.json([])),
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(answer)
    // jsdom can't navigate, so the post-logout reload is stubbed.
    const replace = vi.fn()
    vi.stubGlobal('location', { ...window.location, replace })
    onTestFinished(() => {
      confirm.mockRestore()
      vi.unstubAllGlobals()
    })
    return { loggedOut: () => loggedOut, confirm, replace }
  }

  it('signs out and reloads', async () => {
    const { loggedOut, replace } = setup(true)
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(loggedOut()).toBe(1)
  })

  it('shows a failed sign out, stays signed in, and signs out on Try again', async () => {
    const { replace } = setup(true)
    let fail = true
    server.use(
      http.post('/api/auth/logout', () =>
        fail ? HttpResponse.json({ detail: 'Server unavailable' }, { status: 503 }) : new HttpResponse(null, { status: 204 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(screen.getByText('Signing out…')).toBeInTheDocument()

    expect(await screen.findByText(/Couldn’t sign out: .*Server unavailable/)).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
  })

  it('does not sign out from a /logout reached any other way, even by signing in there', async () => {
    const { loggedOut } = setup(true)
    let signedInNow = false
    server.use(
      http.post('/api/auth/login', () => {
        signedInNow = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/auth/me', () =>
        signedInNow ? HttpResponse.json(testUser) : HttpResponse.json({ detail: 'Not signed in' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/logout' })

    await user.type(await screen.findByLabelText('Username'), 'cook')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(loggedOut()).toBe(0)
  })

  it('asks first with unsaved recipe edits, and stays signed in if cancelled', async () => {
    const { loggedOut, confirm } = setup(false)
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/recipes/7/edit' })

    await user.type(await screen.findByLabelText('Name'), 'y')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(screen.getByLabelText('Name')).toHaveValue('Soupy')
    expect(loggedOut()).toBe(0)
  })

  it('signs out once discarding unsaved recipe edits is confirmed', async () => {
    const { loggedOut, replace } = setup(true)
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/recipes/7/edit' })

    await user.type(await screen.findByLabelText('Name'), 'y')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(loggedOut()).toBe(1)
  })
})
