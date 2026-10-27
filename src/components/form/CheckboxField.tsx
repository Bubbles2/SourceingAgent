import type { ChangeEvent, ReactNode } from 'react'
import { FieldError } from './FieldShell'
import './Form.css'

type CheckboxFieldProps = {
  id: string
  checked: boolean
  required?: boolean
  error?: string
  /** Id of content the checkbox refers to, e.g. a notice */
  describedById?: string
  children: ReactNode
  onChange: (checked: boolean) => void
}

export function CheckboxField({ id, checked, required = false, error, describedById, children, onChange }: CheckboxFieldProps): React.JSX.Element {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.checked)
  }

  const describedBy = [describedById, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={error ? 'checkbox-field field--error' : 'checkbox-field'}>
      <div className="checkbox-field__row">
        <input
          id={id}
          type="checkbox"
          className="checkbox-field__input"
          checked={checked}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={handleChange}
        />
        <label htmlFor={id} className="checkbox-field__label">
          {children}
          {required ? (
            <span className="req" aria-hidden="true">
              {' *'}
            </span>
          ) : null}
        </label>
      </div>
      {error ? <FieldError id={id} message={error} /> : null}
    </div>
  )
}
