import './Avatar.css'

type AvatarProps = {
  firstName: string
  lastName: string
  size?: 'sm' | 'lg'
}

/** Initials in a navy circle. Decorative: put the name in text next to it. */
export function Avatar({ firstName, lastName, size = 'sm' }: AvatarProps): React.JSX.Element {
  const initials = [firstName, lastName]
    .map((name) => Array.from(name.trim())[0] ?? '')
    .join('')
    .toLocaleUpperCase('en-GB')

  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {initials}
    </span>
  )
}
