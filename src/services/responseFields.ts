// Reads fields out of API responses and checks each against the contract, so a mismatch fails here,
// loudly, rather than as a blank cell or "Invalid Date" somewhere on a page.
import { ApiError } from './apiClient'

export type Fields = Record<string, unknown>

export function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null
}

export function contractError(): ApiError {
  return new ApiError(500, 'unexpected_response', 'Something went wrong on our side. Please try again.')
}

export function record(value: unknown): Fields {
  if (!isRecord(value)) {
    throw contractError()
  }
  return value
}

export function text(fields: Fields, key: string): string {
  const value = fields[key]
  if (typeof value !== 'string') {
    throw contractError()
  }
  return value
}

/** Text that must match a pattern, such as an ISO date */
export function matching(fields: Fields, key: string, pattern: RegExp): string {
  const value = text(fields, key)
  if (!pattern.test(value)) {
    throw contractError()
  }
  return value
}

export function integer(fields: Fields, key: string): number {
  const value = fields[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw contractError()
  }
  return value
}

export function nullableInteger(fields: Fields, key: string): number | null {
  return fields[key] === null ? null : integer(fields, key)
}

export function boolean(fields: Fields, key: string): boolean {
  const value = fields[key]
  if (typeof value !== 'boolean') {
    throw contractError()
  }
  return value
}

export function nested(fields: Fields, key: string): Fields {
  return record(fields[key])
}

export function nullableNested(fields: Fields, key: string): Fields | null {
  return fields[key] === null ? null : nested(fields, key)
}

/** One of a fixed set of values, such as a status */
export function oneOf<Value extends string>(fields: Fields, key: string, values: readonly Value[]): Value {
  const value = fields[key]
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) {
    throw contractError()
  }
  return match
}

export function list(data: unknown, key: string): unknown[] {
  const value = isRecord(data) ? data[key] : undefined
  if (!Array.isArray(value)) {
    throw contractError()
  }
  return value
}

export function nullableText(fields: Fields, key: string): string | null {
  return fields[key] === null ? null : text(fields, key)
}

/** Nullable text that must match a pattern when present */
export function nullableMatching(fields: Fields, key: string, pattern: RegExp): string | null {
  return fields[key] === null ? null : matching(fields, key, pattern)
}

/** A list of strings */
export function textList(fields: Fields, key: string): string[] {
  return list(fields, key).map((value) => text({ value }, 'value'))
}
