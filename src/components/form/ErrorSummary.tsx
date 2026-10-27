import { useId, type MouseEvent } from 'react'
import { focusOnMount } from '../../utils/dom'
import './Form.css'

export type FormError = {
  fieldId: string
  message: string
}

type ErrorSummaryProps = {
  errors: readonly FormError[]
}

/**
 * Lists every error at the top of the form and takes focus when it appears (DESIGN.md §10).
 * Give it a new `key` on each failed submit so focus moves to it again.
 */
export function ErrorSummary({ errors }: ErrorSummaryProps): React.JSX.Element {
  const titleId = useId()

  return (
    <div ref={focusOnMount} className="error-summary" tabIndex={-1} aria-labelledby={titleId}>
      <h2 id={titleId} className="error-summary__title">
        {errors.length === 1 ? 'There is a problem with your request' : `There are ${errors.length} problems with your request`}
      </h2>
      <ul className="error-summary__list">
        {errors.map((error) => (
          <li key={error.fieldId}>
            <ErrorLink error={error} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ErrorLink({ error }: { error: FormError }): React.JSX.Element {
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    const field = document.getElementById(error.fieldId)
    if (field) {
      event.preventDefault()
      field.focus()
      field.scrollIntoView({ block: 'center' })
    }
  }

  return (
    <a href={`#${error.fieldId}`} onClick={handleClick}>
      {error.message}
    </a>
  )
}
