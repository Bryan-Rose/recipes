import { Link, useSearchParams } from 'react-router'

import { useAuthConfig } from '../api/auth'
import { imageUrl, useRecipes } from '../api/recipes'
import type { RecipeSummary } from '../api/types'
import { ErrorState, Loading } from '../components/Feedback'
import { formatMinutes } from '../components/minutes'

function totalMinutes(recipe: RecipeSummary) {
  const { active_cook_time: active, inactive_cook_time: inactive } = recipe
  return active == null && inactive == null ? null : (active ?? 0) + (inactive ?? 0)
}

/** Shortest first; recipes without a time go last. */
function byMinutes(minutes: (recipe: RecipeSummary) => number | null | undefined) {
  return (a: RecipeSummary, b: RecipeSummary) => (minutes(a) ?? Infinity) - (minutes(b) ?? Infinity)
}

const byName = (a: RecipeSummary, b: RecipeSummary) => a.name.localeCompare(b.name)

const SORTS: Record<string, { label: string; compare: (a: RecipeSummary, b: RecipeSummary) => number }> = {
  name: { label: 'Name', compare: byName },
  added: { label: 'Recently added', compare: (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id },
  active: { label: 'Active time', compare: byMinutes((recipe) => recipe.active_cook_time) },
  total: { label: 'Total time', compare: byMinutes(totalMinutes) },
}

export function RecipeList() {
  const { data: recipes, isPending, error } = useRecipes()
  const importEnabled = useAuthConfig().data?.recipe_import
  // The view lives in the URL so it survives opening a recipe and coming back.
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const setParam = (key: string, value: string) =>
    setParams(
      (previous) => {
        if (value) previous.set(key, value)
        else previous.delete(key)
        return previous
      },
      { replace: true },
    )

  if (isPending) return <Loading what="recipes" />
  if (error) return <ErrorState error={error} what="recipes" />

  const cookbooks = [...new Map(recipes.flatMap((r) => (r.cookbook ? [[r.cookbook.id, r.cookbook]] : []))).values()]
  cookbooks.sort((a, b) => a.name.localeCompare(b.name))
  // A stale link to a cookbook with no recipes left shows everything rather than an unexplained empty list.
  const cookbookParam = params.get('cookbook') ?? ''
  const cookbookId = cookbooks.some((c) => String(c.id) === cookbookParam) ? cookbookParam : ''
  const tags = [...new Map(recipes.flatMap((r) => r.tags.map((t) => [t.id, t] as const))).values()]
  tags.sort((a, b) => a.name.localeCompare(b.name))
  const tagParam = params.get('tag') ?? ''
  const tagId = tags.some((t) => String(t.id) === tagParam) ? tagParam : ''
  const sort = params.get('sort') ?? ''
  const { compare } = SORTS[sort] ?? SORTS.name

  // shortcut: GET /recipes/ returns every recipe as a summary and this filters it in the browser,
  // fine for a few hundred recipes; add server-side search and paging if the collection gets much larger.
  const needle = search.trim().toLowerCase()
  const visible = recipes
    .filter((recipe) => !cookbookId || String(recipe.cookbook?.id) === cookbookId)
    .filter((recipe) => !tagId || recipe.tags.some((tag) => String(tag.id) === tagId))
    .filter(
      (recipe) =>
        !needle ||
        recipe.name.toLowerCase().includes(needle) ||
        recipe.cookbook?.name.toLowerCase().includes(needle) ||
        recipe.ingredient_names.some((name) => name.toLowerCase().includes(needle)),
    )
    .sort((a, b) => compare(a, b) || byName(a, b))

  return (
    <>
      <div className="page-header">
        <h1>Recipes</h1>
        <div className="row">
          <input
            type="text"
            className="search-input"
            aria-label="Search recipes"
            placeholder="Search name, cookbook, ingredient…"
            value={search}
            onChange={(event) => setParam('q', event.target.value)}
          />
          <select aria-label="Cookbook" value={cookbookId} onChange={(event) => setParam('cookbook', event.target.value)}>
            <option value="">All cookbooks</option>
            {cookbooks.map((cookbook) => (
              <option key={cookbook.id} value={cookbook.id}>
                {cookbook.name}
              </option>
            ))}
          </select>
          <select aria-label="Tag" value={tagId} onChange={(event) => setParam('tag', event.target.value)}>
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort by"
            value={SORTS[sort] ? sort : 'name'}
            onChange={(event) => setParam('sort', event.target.value === 'name' ? '' : event.target.value)}
          >
            {Object.entries(SORTS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {importEnabled && (
            <Link to="/recipes/import" className="button">
              Import
            </Link>
          )}
          <Link to="/recipes/new" className="button primary">
            New recipe
          </Link>
        </div>
      </div>

      {recipes.length === 0 ? (
        <p className="status">
          No recipes yet. <Link to="/recipes/new">Add the first one.</Link>
        </p>
      ) : visible.length === 0 ? (
        <p className="status">{search ? `Nothing matches “${search}”.` : 'No recipes match these filters.'}</p>
      ) : (
        <ul className="recipe-grid" aria-label="Recipes">
          {visible.map((recipe) => {
            const total = totalMinutes(recipe)
            return (
              <li key={recipe.id} className="card recipe-card">
                {/* Decorative: the title beside it names the recipe. Cards without one just start at the title. */}
                {recipe.image && <img className="recipe-card__thumb" src={imageUrl(recipe.image, 'thumb')} alt="" loading="lazy" />}
                {/* The title link stretches over the card; the cookbook and author links sit above it. */}
                <Link to={`/recipes/${recipe.id}`} className="recipe-card__title">
                  {recipe.name}
                </Link>
                {recipe.cookbook && (
                  <span className="recipe-card__meta">
                    <Link to={`/cookbooks/${recipe.cookbook.id}`}>{recipe.cookbook.name}</Link>
                    {recipe.cookbook_page ? `, p. ${recipe.cookbook_page}` : ''}
                    <br />
                    <Link to={`/authors/${recipe.cookbook.author.id}`} className="muted">
                      {recipe.cookbook.author.name}
                    </Link>
                  </span>
                )}
                {recipe.tags.length > 0 && (
                  <ul className="tag-list" aria-label={`${recipe.name} tags`}>
                    {recipe.tags.toSorted((a, b) => a.name.localeCompare(b.name)).map((tag) => (
                      <li key={tag.id} className="tag">
                        <Link to={`/?tag=${tag.id}`}>{tag.name}</Link>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="recipe-card__stats">
                  <span>{recipe.ingredient_names.length} ingredients</span>
                  <span>{recipe.step_count} steps</span>
                  {recipe.active_cook_time != null && <span>{formatMinutes(recipe.active_cook_time)} active</span>}
                  {total != null && total !== recipe.active_cook_time && <span>{formatMinutes(total)} total</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
