import { SegmentedLinks } from '../../components/ui/SegmentedLinks'
import { saleStatusOptions, type SaleStatus } from './saleStatus'

type SaleStatusFilterProps = {
  value: SaleStatus
  /** Accessible name, e.g. "Show auctions" */
  label: string
}

export function SaleStatusFilter({ value, label }: SaleStatusFilterProps): React.JSX.Element {
  const options = saleStatusOptions.map((option) => ({
    label: option.label,
    to: { search: `?status=${option.value}` },
    isCurrent: option.value === value,
  }))

  return <SegmentedLinks label={label} options={options} />
}
