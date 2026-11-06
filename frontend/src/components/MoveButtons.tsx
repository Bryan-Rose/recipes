/** ↑/↓ buttons for one row of an ordered list. `label` names the row, e.g. "step 2". */
export function MoveButtons({
  label,
  index,
  count,
  disabled = false,
  onMove,
}: {
  label: string
  index: number
  count: number
  disabled?: boolean
  onMove: (delta: -1 | 1) => void
}) {
  return (
    <div className="row">
      <button
        type="button"
        className="ghost"
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="ghost"
        aria-label={`Move ${label} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
    </div>
  )
}
