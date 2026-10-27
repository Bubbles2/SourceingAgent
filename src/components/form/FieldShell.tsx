import type { ReactNode } from 'react'
import { CircleX } from 'lucide-react'
import './Form.css'

export type FieldBaseProps = {
  id: string
  label: string
  required?: boolean
  hint?: ReactNode
  error?: string
}

/** Ids of the hint and error, for the control's aria-describedby */
export function describedBy({ id, hint, error }: Pick<FieldBaseProps, 'id' | 'hint' | 'error'>): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

export function FieldError({ id, message }: { id: string; message: string }): React.JSX.Element {
  return (
    <p id={`${id}-error`} className="field__error">
      <CircleX size={14} />
      {message}
    </p>
  )
}

type FieldShellProps = FieldBaseProps & {
  children: ReactNode
}

/** Label, control slot, hint and inline error — DESIGN.md §6.8 */
export function FieldShell({ id, label, required = false, hint, error, children }: FieldShellProps): React.JSX.Element {
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            {' *'}
          </span>
        ) : (
          <span className="field__optional"> (optional)</span>
        )}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={id} message={error} /> : null}
    </div>
  )
}
