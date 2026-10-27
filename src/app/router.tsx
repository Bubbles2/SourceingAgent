import { createBrowserRouter } from 'react-router'
import { SiteLayout } from '../components/layout/SiteLayout'
import { AuctionsPage } from '../pages/AuctionsPage'
import { CalendarPage } from '../pages/CalendarPage'
import { CataloguesPage } from '../pages/CataloguesPage'
import { LandingPage } from '../pages/LandingPage'
import { MyRequestsPage } from '../pages/MyRequestsPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PrivacyPage } from '../pages/PrivacyPage'
import { RegisterPage } from '../pages/RegisterPage'
import { RequestBidPage } from '../pages/RequestBidPage'
import { RequestedLotsPage } from '../pages/RequestedLotsPage'
import { SignInPage } from '../pages/SignInPage'
import { TermsPage } from '../pages/TermsPage'
import { paths } from './paths'

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: paths.auctions, element: <AuctionsPage /> },
      { path: paths.catalogues, element: <CataloguesPage /> },
      { path: paths.calendar, element: <CalendarPage /> },
      { path: paths.requestedLots, element: <RequestedLotsPage /> },
      { path: paths.requestBid, element: <RequestBidPage /> },
      { path: paths.myRequests, element: <MyRequestsPage /> },
      { path: paths.signIn, element: <SignInPage /> },
      { path: paths.register, element: <RegisterPage /> },
      { path: paths.terms, element: <TermsPage /> },
      { path: paths.privacy, element: <PrivacyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
