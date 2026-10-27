import { Outlet, ScrollRestoration } from 'react-router'
import { Footer } from './Footer'
import { Header } from './Header'

export function SiteLayout(): React.JSX.Element {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </>
  )
}
