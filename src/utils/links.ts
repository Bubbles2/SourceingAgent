/** Browsers drop tabs and newlines from addresses, so "/\t/other.example" would become "//other.example". */
export function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}
