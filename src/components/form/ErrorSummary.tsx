import { useId, type MouseEvent } from 'react'
import { focusOnMount } from '../../utils/dom'
import './Form.css'

export type FormError = {
  /** The field to link to; omit for problems with the whole form, such as a failed sign-in */
  fieldId?: string
  message: string
}

type ErrorSummaryProps = {
  errors: readonly FormError[]
  /** Ends the title: "There is a problem with your request" */
  subject?: string
}

/**
 * Lists every error at the top of the form and takes focus when it appears (DESIGN.md §10).
 * Give it a new `key` on each failed submit so focus moves to it again.
 */
export function ErrorSummary({ errors, subject = 'with your request' }: ErrorSummaryProps): React.JSX.Element {
  const titleId = useId()

  return (
    <div ref={focusOnMount} className="error-summary" tabIndex={-1} aria-labelledby={titleId}>
      <h2 id={titleId} className="error-summary__title">
        {errors.length === 1 ? `There is a problem ${subject}` : `There are ${errors.length} problems ${subject}`}
      </h2>
      <ul className="error-summary__list">
        {errors.map((error) => (
          <li key={error.fieldId ?? error.message}>
            {error.fieldId ? <ErrorLink fieldId={error.fieldId} message={error.message} /> : error.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ErrorLink({ fieldId, message }: { fieldId: string; message: string }): React.JSX.Element {
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    const field = document.getElementById(fieldId)
    if (field) {
      event.preventDefault()
      field.focus()
      field.scrollIntoView({ block: 'center' })
    }
  }

  return (
    <a href={`#${fieldId}`} onClick={handleClick}>
      {message}
    </a>
  )
}
