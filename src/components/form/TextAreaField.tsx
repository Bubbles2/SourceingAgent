import type { ChangeEvent } from 'react'
import { describedBy, FieldShell, type FieldBaseProps } from './FieldShell'

type TextAreaFieldProps = FieldBaseProps & {
  value: string
  maxLength: number
  placeholder?: string
  onChange: (value: string) => void
}

/** Multi-line text with a live character count in the hint. */
export function TextAreaField({ value, maxLength, placeholder, onChange, hint, ...field }: TextAreaFieldProps): React.JSX.Element {
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange(event.target.value)
  }

  const count = `${value.length.toLocaleString('en-GB')} / ${maxLength.toLocaleString('en-GB')} characters`
  const fullHint = hint ? (
    <>
      {hint} <span className="field__count">{count}</span>
    </>
  ) : (
    count
  )

  return (
    <FieldShell {...field} hint={fullHint}>
      <textarea
        id={field.id}
        className="field__input field__input--multiline"
        value={value}
        placeholder={placeholder}
        rows={4}
        required={field.required}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy({ ...field, hint: fullHint })}
        onChange={handleChange}
      />
    </FieldShell>
  )
}
