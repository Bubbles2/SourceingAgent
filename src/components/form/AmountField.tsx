import type { ChangeEvent } from 'react'
import { formatAmountForInput, parseWholeEuros } from '../../utils/money'
import { describedBy, FieldShell, type FieldBaseProps } from './FieldShell'

type AmountFieldProps = FieldBaseProps & {
  value: string
  onChange: (value: string) => void
}

/** Whole-euro amount with a € prefix; adds thousands separators on blur (DESIGN.md §6.8). */
export function AmountField({ value, onChange, ...field }: AmountFieldProps): React.JSX.Element {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value)
  }

  function handleBlur(): void {
    const amount = parseWholeEuros(value)
    if (amount !== null) {
      onChange(formatAmountForInput(amount))
    }
  }

  return (
    <FieldShell {...field}>
      <div className="amount-input">
        <span className="amount-input__prefix" aria-hidden="true">
          €
        </span>
        <input
          id={field.id}
          type="text"
          className="field__input amount-input__control"
          value={value}
          inputMode="numeric"
          autoComplete="off"
          required={field.required}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={describedBy(field)}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>
    </FieldShell>
  )
}
