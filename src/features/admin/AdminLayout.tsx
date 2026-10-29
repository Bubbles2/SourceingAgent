import { NavLink, Outlet } from 'react-router'
import { paths } from '../../app/paths'
import { PageContainer } from '../../components/layout/PageContainer'
import { ButtonLink } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useCurrentCustomer } from '../auth/useCurrentCustomer'
import { AdministratorsOnly } from './AdministratorsOnly'
import './AdminLayout.css'

const adminLinks = [
  { label: 'Dashboard', to: paths.admin, end: true },
  { label: 'Bid requests', to: paths.reviewRequests, end: false },
] as const

/**
 * Frame for every administration page. Loaders keep visitors and customers out before anything is
 * fetched (and the API refuses them regardless); this also covers signing out, or losing the role,
 * while a page is open.
 */
export function AdminLayout(): React.JSX.Element {
  const account = useCurrentCustomer()

  if (!account) {
    return (
      <PageContainer eyebrow="Administration" title="Administration">
        <EmptyState title="You're signed out" actions={<ButtonLink to={paths.signIn}>Sign in</ButtonLink>}>
          Sign in again to review bid requests.
        </EmptyState>
      </PageContainer>
    )
  }
  if (account.role !== 'administrator') {
    return <AdministratorsOnly />
  }

  return (
    <>
      <div className="admin-bar">
        <nav className="container admin-bar__nav" aria-label="Administration">
          {adminLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="admin-bar__link">
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  )
}
