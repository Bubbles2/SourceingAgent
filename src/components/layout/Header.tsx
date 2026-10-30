import { useRef, useState, type KeyboardEvent } from 'react'
import { Form, Link, useLocation } from 'react-router'
import { Menu, Search, X } from 'lucide-react'
import { paths } from '../../app/paths'
import { AccountActions } from '../navigation/AccountActions'
import { MainNav } from '../navigation/MainNav'
import { Button } from '../ui/Button'
import { Ribbon } from './Ribbon'
import './Header.css'

const menuId = 'site-menu'

export function Header(): React.JSX.Element {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const searchQuery = location.pathname === paths.search ? new URLSearchParams(location.search).get('q') ?? '' : ''

  function handleToggleMenu(): void {
    setIsMenuOpen((open) => !open)
  }

  function handleCloseMenu(): void {
    setIsMenuOpen(false)
  }

  function handleHeaderKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Escape' || !isMenuOpen) {
      return
    }
    setIsMenuOpen(false)
    toggleRef.current?.focus()
  }

  return (
    <>
      <header
        className={isMenuOpen ? 'site-header site-header--open' : 'site-header'}
        onKeyDown={handleHeaderKeyDown}
      >
        <div className="container site-header__inner">
          <Link to={paths.home} className="site-header__brand" onClick={handleCloseMenu}>
            <img className="site-header__logo" src="/assets/happy_owl_transparent.png" alt="" width={46} height={46} />
            <span className="site-header__wordmark">Parisien Sourcing Agent</span>
          </Link>

          <Button
            ref={toggleRef}
            variant="secondary"
            className="site-header__toggle"
            aria-label="Menu"
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={handleToggleMenu}
          >
            {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </Button>

          <div id={menuId} className="site-header__menu">
            <MainNav className="site-header__nav" onNavigate={handleCloseMenu} />
            <AccountActions onNavigate={handleCloseMenu} />
          </div>
          <Form role="search" method="get" action={paths.search} className="site-header__search" onSubmit={handleCloseMenu}>
            <label className="visually-hidden" htmlFor="site-search">Search auction lots</label>
            <Search size={22} aria-hidden="true" />
            <input id="site-search" name="q" type="search" key={searchQuery} defaultValue={searchQuery} minLength={2} maxLength={200} placeholder="Search auction lots, artists, objects…" required />
            <button type="submit">Search</button>
          </Form>
        </div>
      </header>
      <Ribbon />
    </>
  )
}
