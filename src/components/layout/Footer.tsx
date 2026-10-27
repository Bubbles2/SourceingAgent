import { Link } from 'react-router'
import { bidRequestNavItems, customerAccountNavItems, guestAccountNavItems, mainNavItems, type NavItem } from '../../app/navigation'
import { feesNoticeId, paths } from '../../app/paths'
import { useCurrentCustomer } from '../../features/auth/useCurrentCustomer'
import { Ribbon } from './Ribbon'
import './Footer.css'

const legalNavItems: readonly NavItem[] = [
  { label: 'Terms of service', to: paths.terms },
  { label: 'Privacy', to: paths.privacy },
  { label: 'Fees notice', to: `${paths.home}#${feesNoticeId}` },
]

export function Footer(): React.JSX.Element {
  const customer = useCurrentCustomer()
  const footerColumns: readonly { title: string; links: readonly NavItem[] }[] = [
    { title: 'Explore', links: mainNavItems },
    { title: 'Account', links: [...(customer ? customerAccountNavItems : guestAccountNavItems), ...bidRequestNavItems] },
    { title: 'Legal', links: legalNavItems },
  ]

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <p className="site-footer__wordmark">Parisien Sourcing Agent</p>
            <p className="site-footer__about">
              Bid requests for Parisien auctions, handled by a Paris-based sourcing agent. We do not run live auctions.
            </p>
          </div>
          {footerColumns.map((column) => (
            <div key={column.title} className="site-footer__column">
              <h2 className="site-footer__title">{column.title}</h2>
              <ul className="site-footer__links">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="site-footer__link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="site-footer__bottom">
          <p>© 2026 Parisien Sourcing Agent · Paris</p>
          <Ribbon variant="signoff" />
        </div>
      </div>
    </footer>
  )
}
