import { NavLink } from 'react-router'
import { mainNavItems } from '../../app/navigation'
import './MainNav.css'

type MainNavProps = {
  className?: string
  onNavigate?: () => void
}

export function MainNav({ className, onNavigate }: MainNavProps): React.JSX.Element {
  return (
    <nav className={className ? `main-nav ${className}` : 'main-nav'} aria-label="Main">
      <ul className="main-nav__list">
        {mainNavItems.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className="main-nav__link" onClick={onNavigate}>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
