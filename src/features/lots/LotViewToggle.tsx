import './LotViewToggle.css'

export type LotView = 'tiles' | 'details'

type LotViewToggleProps = {
  view: LotView
  onChange: (view: LotView) => void
}

export function LotViewToggle({ view, onChange }: LotViewToggleProps): React.JSX.Element {
  return (
    <div className="lot-view-toggle" role="group" aria-label="Lot view">
      <button type="button" aria-pressed={view === 'tiles'} onClick={() => onChange('tiles')}>Tiles</button>
      <button type="button" aria-pressed={view === 'details'} onClick={() => onChange('details')}>Details</button>
    </div>
  )
}
