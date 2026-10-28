import type { FormErrors } from '../../components/form/useValidatedForm'
import { ApiError } from '../../services/apiClient'

/**
 * Puts an API failure on the form: field problems next to their fields (the API reports them as
 * "body.<field>"), anything else (rate limits, an unreachable server) at the top.
 * Errors that aren't from the API are rethrown, for the form's generic message.
 */
export function formErrorsFromApi<Values>(
  error: unknown,
  fields: readonly (keyof Values & string)[],
  /** Error codes that belong to one field, e.g. { email_taken: 'email' } */
  codeFields: Partial<Record<string, keyof Values>> = {},
): FormErrors<Values> {
  if (!(error instanceof ApiError)) {
    throw error
  }
  const errors: FormErrors<Values> = {}

  const codeField = codeFields[error.code]
  if (codeField) {
    errors[codeField] = error.message
    return errors
  }

  for (const detail of error.details) {
    const field = fields.find((name) => `body.${name}` === detail.path)
    if (field && !errors[field]) {
      errors[field] = detail.message
    }
  }
  if (Object.keys(errors).length === 0) {
    errors.form = error.message
  }
  return errors
}
