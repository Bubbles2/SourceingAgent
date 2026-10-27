import type { ComponentProps } from 'react'
import { Link, type LinkProps } from 'react-router'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'ghost-on-navy' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonStyleProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

type ButtonProps = ButtonStyleProps & ComponentProps<'button'>

type ButtonLinkProps = ButtonStyleProps & (LinkProps | ComponentProps<'a'>)

function getButtonClassName({ variant = 'primary', size = 'md', className }: ButtonStyleProps): string {
  return [
    'btn',
    variant !== 'primary' && `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

export function Button({ variant, size, className, type = 'button', ...buttonProps }: ButtonProps): React.JSX.Element {
  return <button type={type} className={getButtonClassName({ variant, size, className })} {...buttonProps} />
}

/** A link styled as a button: a router `Link` when given `to`, a plain `<a>` when given `href`. */
export function ButtonLink({ variant, size, className, ...linkProps }: ButtonLinkProps): React.JSX.Element {
  const buttonClassName = getButtonClassName({ variant, size, className })

  if ('to' in linkProps) {
    return <Link className={buttonClassName} {...linkProps} />
  }

  return <a className={buttonClassName} {...linkProps} />
}
