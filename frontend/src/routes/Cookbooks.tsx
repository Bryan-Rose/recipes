import { Link, useParams } from 'react-router'

import { useAuthors, useCookbooks } from '../api/lookups'
import { useRecipes } from '../api/recipes'
import type { Cookbook, RecipeSummary } from '../api/types'
import { ErrorState, Loading } from '../components/Feedback'

const plural = (count: number) => `${count} ${count === 1 ? 'recipe' : 'recipes'}`

export function CookbookIndex() {
  const { data: cookbooks, isPending, error } = useCookbooks()

  if (isPending) return <Loading what="cookbooks" />
  if (error) return <ErrorState error={error} what="cookbooks" />

  return (
    <>
      <h1>Cookbooks</h1>
      {cookbooks.length === 0 ? (
        <p className="status">
          No cookbooks yet. Add one under <Link to="/lookups/cookbooks">Lookups</Link>.
        </p>
      ) : (
        <ul className="stack browse-list" aria-label="Cookbooks">
          {[...cookbooks]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((cookbook) => (
              <li key={cookbook.id} className="card browse-item">
                <Link to={`/cookbooks/${cookbook.id}`}>{cookbook.name}</Link>{' '}
                <span className="muted">
                  by <Link to={`/authors/${cookbook.author.id}`}>{cookbook.author.name}</Link> ·{' '}
                  {plural(cookbook.recipe_count)}
                </span>
              </li>
            ))}
        </ul>
      )}
    </>
  )
}

export function CookbookPage() {
  const id = Number(useParams().cookbookId)
  const cookbooks = useCookbooks()
  const recipes = useRecipes()

  if (cookbooks.isPending || recipes.isPending) return <Loading what="cookbook" />
  if (cookbooks.error || recipes.error) return <ErrorState error={cookbooks.error ?? recipes.error} what="this cookbook" />

  const cookbook = cookbooks.data.find((item) => item.id === id)
  if (!cookbook) return <Missing what="cookbook" />

  return (
    <>
      <BackLink />
      <h1>{cookbook.name}</h1>
      <p className="muted">
        by <Link to={`/authors/${cookbook.author.id}`}>{cookbook.author.name}</Link>
      </p>
      <CookbookRecipes cookbook={cookbook} recipes={recipes.data} />
    </>
  )
}

export function AuthorPage() {
  const id = Number(useParams().authorId)
  const authors = useAuthors()
  const cookbooks = useCookbooks()
  const recipes = useRecipes()

  if (authors.isPending || cookbooks.isPending || recipes.isPending) return <Loading what="author" />
  if (authors.error || cookbooks.error || recipes.error)
    return <ErrorState error={authors.error ?? cookbooks.error ?? recipes.error} what="this author" />

  const author = authors.data.find((item) => item.id === id)
  if (!author) return <Missing what="author" />
  const theirs = cookbooks.data.filter((cookbook) => cookbook.author.id === id).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <BackLink />
      <h1>{author.name}</h1>
      {theirs.length === 0 ? (
        <p className="status">No cookbooks by {author.name} yet.</p>
      ) : (
        theirs.map((cookbook) => (
          <section key={cookbook.id} aria-label={cookbook.name}>
            <h2>
              <Link to={`/cookbooks/${cookbook.id}`}>{cookbook.name}</Link>
            </h2>
            <CookbookRecipes cookbook={cookbook} recipes={recipes.data} />
          </section>
        ))
      )}
    </>
  )
}

/** A cookbook's recipes in page order; those without a page come last, by name. */
function CookbookRecipes({ cookbook, recipes }: { cookbook: Cookbook; recipes: RecipeSummary[] }) {
  const inBook = recipes
    .filter((recipe) => recipe.cookbook?.id === cookbook.id)
    .sort(
      // Two unpaged recipes give Infinity - Infinity = NaN, which is falsy, so they fall through to the name.
      (a, b) =>
        (a.cookbook_page ?? Infinity) - (b.cookbook_page ?? Infinity) || a.name.localeCompare(b.name),
    )

  if (inBook.length === 0) return <p className="muted">No recipes from this cookbook yet.</p>
  return (
    <ul className="stack browse-list" aria-label={`Recipes in ${cookbook.name}`}>
      {inBook.map((recipe) => (
        <li key={recipe.id} className="card browse-item">
          <span className="browse-item__page muted">{recipe.cookbook_page ? `p. ${recipe.cookbook_page}` : '—'}</span>
          <Link to={`/recipes/${recipe.id}`}>{recipe.name}</Link>
        </li>
      ))}
    </ul>
  )
}

function BackLink() {
  return (
    <p style={{ marginTop: 0 }}>
      <Link to="/cookbooks">← All cookbooks</Link>
    </p>
  )
}

function Missing({ what }: { what: string }) {
  return (
    <div className="status">
      <h1>No such {what}</h1>
      <p>
        <Link to="/cookbooks">Back to all cookbooks</Link>
      </p>
    </div>
  )
}
