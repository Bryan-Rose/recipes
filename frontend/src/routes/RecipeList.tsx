import { useState } from 'react'
import { Link } from 'react-router'

import { useRecipes } from '../api/recipes'
import { ErrorState, Loading } from '../components/Feedback'

export function RecipeList() {
  const { data: recipes, isPending, error } = useRecipes()
  const [search, setSearch] = useState('')

  if (isPending) return <Loading what="recipes" />
  if (error) return <ErrorState error={error} what="recipes" />

  // The API has no search parameter, and GET /recipes/ already returns every
  // recipe fully nested, so filtering here costs nothing extra.
  const needle = search.trim().toLowerCase()
  const visible = needle
    ? recipes.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(needle) ||
          recipe.cookbook?.name.toLowerCase().includes(needle) ||
          recipe.recipe_ingredients.some((item) => item.ingredient.name.toLowerCase().includes(needle)),
      )
    : recipes

  return (
    <>
      <div className="page-header">
        <h1>Recipes</h1>
        <div className="row">
          <input
            type="text"
            className="search-input"
            placeholder="Search name, cookbook, ingredient…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Link to="/recipes/new">
            <button type="button" className="primary">
              New recipe
            </button>
          </Link>
        </div>
      </div>

      {recipes.length === 0 ? (
        <p className="status">
          No recipes yet. <Link to="/recipes/new">Add the first one.</Link>
        </p>
      ) : visible.length === 0 ? (
        <p className="status">Nothing matches “{search}”.</p>
      ) : (
        <ul className="recipe-grid">
          {visible.map((recipe) => (
            <li key={recipe.id}>
              <Link to={`/recipes/${recipe.id}`} className="card recipe-card">
                <span className="recipe-card__title">{recipe.name}</span>
                {recipe.cookbook && (
                  <span className="recipe-card__meta">
                    {recipe.cookbook.name}
                    {recipe.cookbook_page ? `, p. ${recipe.cookbook_page}` : ''}
                    <br />
                    <span className="muted">{recipe.cookbook.author.name}</span>
                  </span>
                )}
                <span className="recipe-card__stats">
                  <span>{recipe.recipe_ingredients.length} ingredients</span>
                  <span>{recipe.steps.length} steps</span>
                  {recipe.active_cook_time && <span>{recipe.active_cook_time} active</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
