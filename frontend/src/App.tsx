import { Link, Navigate, Route, Routes } from 'react-router'

import { useLogout, useMe } from './api/auth'
import { ErrorState, Loading } from './components/Feedback'
import { LoginPage } from './routes/LoginPage'
import { RecipeDetail } from './routes/RecipeDetail'
import { RecipeEdit } from './routes/RecipeEdit'
import { RecipeList } from './routes/RecipeList'
import { UserAdmin } from './routes/UserAdmin'
import './App.css'

function App() {
  const { data: user, isPending, error } = useMe()
  const logout = useLogout()

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="app-header__brand">
            Recipes
          </Link>
          {user && (
            <div className="row">
              {user.is_superuser && <Link to="/users">Users</Link>}
              <span className="muted">{user.full_name}</span>
              <button type="button" className="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
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
      <Route path="/recipes/:recipeId" element={<RecipeDetail />} />
      <Route path="/recipes/:recipeId/edit" element={<RecipeEdit />} />
      <Route path="/users" element={isAdmin ? <UserAdmin /> : <NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
