import { Link, Route, Routes } from 'react-router'

import { RecipeDetail } from './routes/RecipeDetail'
import { RecipeEdit } from './routes/RecipeEdit'
import { RecipeList } from './routes/RecipeList'
import './App.css'

function App() {
  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="app-header__brand">
            Recipes
          </Link>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/recipes/new" element={<RecipeEdit />} />
          <Route path="/recipes/:recipeId" element={<RecipeDetail />} />
          <Route path="/recipes/:recipeId/edit" element={<RecipeEdit />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
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
