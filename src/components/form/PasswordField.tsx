import { useState, type ChangeEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { describedBy, FieldShell, type FieldBaseProps } from './FieldShell'

type PasswordFieldProps = FieldBaseProps & {
  value: string
  autoComplete: 'current-password' | 'new-password'
  onChange: (value: string) => void
}

/** Password input with a Show/Hide button; the change is announced to screen readers. */
export function PasswordField({ value, autoComplete, onChange, ...field }: PasswordFieldProps): React.JSX.Element {
  const [isVisible, setIsVisible] = useState(false)
  // Empty until the first toggle, so nothing is announced on load
  const [announcement, setAnnouncement] = useState('')

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value)
  }

  function handleToggle(): void {
    const nextVisible = !isVisible
    setIsVisible(nextVisible)
    setAnnouncement(nextVisible ? 'Your password is visible' : 'Your password is hidden')
  }

  return (
    <FieldShell {...field}>
      <div className="password-input">
        <input
          id={field.id}
          type={isVisible ? 'text' : 'password'}
          className="field__input password-input__control"
          value={value}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required={field.required}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={describedBy(field)}
          onChange={handleChange}
        />
        <button type="button" className="password-input__toggle" aria-controls={field.id} onClick={handleToggle}>
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          <span>
            {isVisible ? 'Hide' : 'Show'}
            <span className="visually-hidden"> password</span>
          </span>
        </button>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {announcement}
      </span>
    </FieldShell>
  )
}
