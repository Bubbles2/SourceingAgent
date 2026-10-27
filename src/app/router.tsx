import { createBrowserRouter } from 'react-router'
import { PageLoading } from '../components/layout/PageLoading'
import { SiteLayout } from '../components/layout/SiteLayout'
import { AuctionDetailsPage } from '../pages/AuctionDetailsPage'
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
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { SignInPage } from '../pages/SignInPage'
import { TermsPage } from '../pages/TermsPage'
import { auctionDetailsLoader, auctionsLoader, cataloguesLoader, landingLoader } from './loaders'
import { paths } from './paths'

const pageLoading = <PageLoading />

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      {
        // Errors render inside the layout so the header and footer stay available.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, loader: landingLoader, element: <LandingPage />, hydrateFallbackElement: pageLoading },
          { path: paths.auctions, loader: auctionsLoader, element: <AuctionsPage />, hydrateFallbackElement: pageLoading },
          {
            path: `${paths.auctions}/:auctionId`,
            loader: auctionDetailsLoader,
            element: <AuctionDetailsPage />,
            hydrateFallbackElement: pageLoading,
          },
          {
            path: paths.catalogues,
            loader: cataloguesLoader,
            element: <CataloguesPage />,
            hydrateFallbackElement: pageLoading,
          },
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
    ],
  },
])
