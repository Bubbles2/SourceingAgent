import { useState } from 'react'
import type { FormError } from './ErrorSummary'

/** Errors by field; `form` holds problems with the whole form, such as a failed sign-in. */
export type FormErrors<Values> = Partial<Record<keyof Values | 'form', string>>

export type FormValidation<Values, Input> = {
  errors: FormErrors<Values>
  /** Cleaned-up values ready to send, or null while anything is invalid */
  input: Input | null
}

type UseValidatedFormOptions<Values, Input> = {
  initialValues: Values
  validate: (values: Values) => FormValidation<Values, Input>
  /** Sends valid input. Resolves with errors to show, or null on success, when the form stays busy while the page moves on. */
  onSubmit: (input: Input) => Promise<FormErrors<Values> | null>
}

const unexpectedErrorMessage = "We couldn't complete this just now. Check your connection, then try again in a moment."

/**
 * Form values, errors and submission state. Errors appear after the first submit and from then on
 * update as the customer edits.
 */
export function useValidatedForm<Values extends object, Input>({
  initialValues,
  validate,
  onSubmit,
}: UseValidatedFormOptions<Values, Input>) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<FormErrors<Values>>({})
  // Re-keys the error summary so it takes focus again after each failed submit
  const [failedSubmits, setFailedSubmits] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function setField<Field extends keyof Values>(field: Field, value: Values[Field]): void {
    const next = { ...values, [field]: value }
    setValues(next)
    if (failedSubmits > 0) {
      setErrors(validate(next).errors)
    }
  }

  function showErrors(nextErrors: FormErrors<Values>): void {
    setErrors(nextErrors)
    setFailedSubmits((count) => count + 1)
  }

  async function submit(): Promise<void> {
    if (isSubmitting) {
      return
    }
    const { errors: validationErrors, input } = validate(values)
    if (!input) {
      showErrors(validationErrors)
      return
    }

    setIsSubmitting(true)
    let submitErrors: FormErrors<Values> | null
    try {
      submitErrors = await onSubmit(input)
    } catch (error) {
      // API refusals come back as form errors, so this is a bug: keep it visible to developers.
      console.error(error)
      submitErrors = {}
      submitErrors.form = unexpectedErrorMessage
    }
    if (submitErrors) {
      setIsSubmitting(false)
      showErrors(submitErrors)
    }
  }

  return { values, errors, failedSubmits, isSubmitting, setField, submit }
}

/** Errors for the summary, in form order, with any whole-form problem first */
export function toSummaryErrors<Values>(errors: FormErrors<Values>, fieldIds: Record<keyof Values, string>): FormError[] {
  const fields = Object.keys(fieldIds) as (keyof Values)[]
  const fieldErrors = fields.flatMap((field) => {
    const message = errors[field]
    return message ? [{ fieldId: fieldIds[field], message }] : []
  })
  return errors.form ? [{ message: errors.form }, ...fieldErrors] : fieldErrors
}
