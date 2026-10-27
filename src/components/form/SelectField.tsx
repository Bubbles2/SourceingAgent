import type { ChangeEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { describedBy, FieldShell, type FieldBaseProps } from './FieldShell'

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type SelectFieldProps = FieldBaseProps & {
  value: string
  options: readonly SelectOption[]
  /** First, empty option, e.g. "Choose an auction" */
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function SelectField({ value, options, placeholder, disabled = false, onChange, ...field }: SelectFieldProps): React.JSX.Element {
  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    onChange(event.target.value)
  }

  return (
    <FieldShell {...field}>
      <div className="select-input">
        <select
          id={field.id}
          className="field__input"
          value={value}
          disabled={disabled}
          required={field.required}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={describedBy(field)}
          onChange={handleChange}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="select-input__icon" />
      </div>
    </FieldShell>
  )
}
