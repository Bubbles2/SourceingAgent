import type { ChangeEvent, HTMLAttributes } from 'react'
import { describedBy, FieldShell, type FieldBaseProps } from './FieldShell'

type TextFieldProps = FieldBaseProps & {
  value: string
  /** date and time use the browser's own pickers and give YYYY-MM-DD and HH:mm */
  type?: 'text' | 'email' | 'tel' | 'url' | 'date' | 'time'
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  className?: string
  onChange: (value: string) => void
}

export function TextField({ value, type = 'text', inputMode, autoComplete = 'off', className, onChange, ...field }: TextFieldProps): React.JSX.Element {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value)
  }

  return (
    <FieldShell {...field}>
      <input
        id={field.id}
        type={type}
        className={className ? `field__input ${className}` : 'field__input'}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={field.required}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(field)}
        onChange={handleChange}
      />
    </FieldShell>
  )
}
