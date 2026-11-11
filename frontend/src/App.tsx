import { useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'

import { useLogout, useMe } from './api/auth'
import { describeError } from './api/errors'
import { ErrorState, Loading } from './components/Feedback'
import { Account } from './routes/Account'
import { AuthorPage, CookbookIndex, CookbookPage } from './routes/Cookbooks'
import { LoginPage } from './routes/LoginPage'
import { ImportRecipe } from './routes/ImportRecipe'
import { Lookups } from './routes/Lookups'
import { RecipeDetail } from './routes/RecipeDetail'
import { RecipeEdit } from './routes/RecipeEdit'
import { RecipeList } from './routes/RecipeList'
import { UserAdmin } from './routes/UserAdmin'
import './App.css'

function App() {
  const { data: user, isPending, error } = useMe()
  const navigate = useNavigate()

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="app-header__brand">
            Recipes
          </Link>
          {user && (
            <div className="row">
              <Link to="/cookbooks">Cookbooks</Link>
              <Link to="/lookups">Lookups</Link>
              {user.is_superuser && <Link to="/users">Users</Link>}
              <Link to="/account" className="muted">
                {user.full_name}
              </Link>
              <button type="button" className="ghost" onClick={() => void navigate('/logout', { state: SIGN_OUT })}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        {isPending ? (
          <Loading what="session" />
        ) : error ? (
          <ErrorState error={error} what="session" />
        ) : !user ? (
          <LoginPage />
        ) : (
          <AppRoutes isAdmin={user.is_superuser} />
        )}
      </main>
    </>
  )
}

function AppRoutes({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/" element={<RecipeList />} />
      <Route path="/recipes/new" element={<RecipeEdit />} />
      <Route path="/recipes/import" element={<ImportRecipe />} />
      <Route path="/recipes/:recipeId" element={<RecipeDetail />} />
      <Route path="/recipes/:recipeId/edit" element={<RecipeEdit />} />
      <Route path="/cookbooks" element={<CookbookIndex />} />
      <Route path="/cookbooks/:cookbookId" element={<CookbookPage />} />
      <Route path="/authors/:authorId" element={<AuthorPage />} />
      <Route path="/lookups/:kind?" element={<Lookups />} />
      <Route path="/account" element={<Account />} />
      <Route path="/logout" element={<SignOutRoute />} />
      <Route path="/users" element={isAdmin ? <UserAdmin /> : <NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

/** History state that only the header's Sign out sets, so a link to /logout signs nobody out. */
const SIGN_OUT = 'sign-out'

/**
 * A route, not a click handler, so leaving the page (and its unsaved-edit guard) comes first.
 * Without the header's state (a typed or linked /logout, or signing in there) it goes home.
 */
function SignOutRoute() {
  return useLocation().state === SIGN_OUT ? <SignOut /> : <Navigate to="/" replace />
}

function SignOut() {
  const { mutate, error } = useLogout()
  useEffect(() => {
    mutate()
  }, [mutate])

  if (!error) return <p className="status">Signing out…</p>
  return (
    <div className="status">
      <p className="error-box">Couldn’t sign out: {describeError(error)}</p>
      <button type="button" style={{ marginTop: '1rem' }} onClick={() => mutate()}>
        Try again
      </button>
    </div>
  )
}

function NotFound() {
  return (
    <div className="status">
      <h1>Not found</h1>
      <p>
        <Link to="/">Back to all recipes</Link>
      </p>
    </div>
  )
}

export default App
