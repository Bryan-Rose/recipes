import { Link } from 'react-router'

import { useImportHistory } from '../api/recipes'
import type { ImportRecord } from '../api/types'
import { formatCost } from '../components/cost'
import { isoDay, monday } from '../components/days'
import { ErrorState, Loading } from '../components/Feedback'

interface Total {
  label: string
  imports: number
  known: number
  unknown: number
}

/** Imports summed per period, newest first (the history already is), in the browser's time zone. */
function totalsBy(history: ImportRecord[], period: (date: Date) => string): Total[] {
  const totals = new Map<string, Total>()
  for (const row of history) {
    const label = period(new Date(row.created_at))
    const total = totals.get(label) ?? { label, imports: 0, known: 0, unknown: 0 }
    total.imports += 1
    if (row.cost_usd === null) total.unknown += 1
    else total.known += row.cost_usd
    totals.set(label, total)
  }
  return [...totals.values()]
}

const weekOf = (date: Date) => `Week of ${monday(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
const monthOf = (date: Date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

const OUTCOME = { draft: 'Not saved', no_draft: 'No recipe found', cut_off: 'Too long' } as const
const SOURCE = { text: 'Text', photos: 'Photos', url: 'Link' } as const

/** What reading recipes with Claude has cost: weekly and monthly totals, then each import. */
export function ImportCosts() {
  const { data: history, isPending, error } = useImportHistory()
  if (isPending) return <Loading what="import costs" />
  if (error) return <ErrorState error={error} what="import costs" />

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Import costs</h1>
      </div>
      {history.length === 0 ? (
        <p className="muted">No recipes imported yet.</p>
      ) : (
        <>
          <TotalsTable title="By week" totals={totalsBy(history, weekOf)} />
          <TotalsTable title="By month" totals={totalsBy(history, monthOf)} />
          <section className="card editor-section">
            <h2 className="section-heading">Imports</h2>
            <table className="cost-table" aria-label="Imports">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>Recipe</th>
                  <th>Model</th>
                  <th>Tokens in / out</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{isoDay(new Date(row.created_at))}</td>
                    <td>{SOURCE[row.source]}</td>
                    <td>
                      {row.recipe ? (
                        <Link to={`/recipes/${row.recipe.id}`}>{row.recipe.name}</Link>
                      ) : (
                        <span className="muted">{row.saved ? 'Recipe deleted' : OUTCOME[row.outcome]}</span>
                      )}
                    </td>
                    <td>{row.model}</td>
                    <td>
                      {row.input_tokens.toLocaleString()} / {row.output_tokens.toLocaleString()}
                    </td>
                    <td>{formatCost(row.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

function TotalsTable({ title, totals }: { title: string; totals: Total[] }) {
  return (
    <section className="card editor-section">
      <h2 className="section-heading">{title}</h2>
      <table className="cost-table" aria-label={title}>
        <thead>
          <tr>
            <th>Period</th>
            <th>Imports</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((total) => (
            <tr key={total.label}>
              <td>{total.label}</td>
              <td>{total.imports}</td>
              <td>
                {formatCost(total.known)}
                {total.unknown > 0 && ` + ${total.unknown} unpriced`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
