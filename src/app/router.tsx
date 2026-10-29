import { createBrowserRouter } from 'react-router'
import { PageLoading } from '../components/layout/PageLoading'
import { SiteLayout } from '../components/layout/SiteLayout'
import { AdminLayout } from '../features/admin/AdminLayout'
import { AccountPage } from '../pages/AccountPage'
import { AdminDashboardPage } from '../pages/AdminDashboardPage'
import { AuctionDetailsPage } from '../pages/AuctionDetailsPage'
import { AuctionsPage } from '../pages/AuctionsPage'
import { CalendarPage } from '../pages/CalendarPage'
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage'
import { LandingPage } from '../pages/LandingPage'
import { LotsPage } from '../pages/LotsPage'
import { MyRequestsPage } from '../pages/MyRequestsPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PrivacyPage } from '../pages/PrivacyPage'
import { RegisterPage } from '../pages/RegisterPage'
import { RequestBidPage } from '../pages/RequestBidPage'
import { RequestedLotsPage } from '../pages/RequestedLotsPage'
import { ResetPasswordPage } from '../pages/ResetPasswordPage'
import { ReviewRequestsPage } from '../pages/ReviewRequestsPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { SignInPage } from '../pages/SignInPage'
import { TermsPage } from '../pages/TermsPage'
import { VerifyEmailPage } from '../pages/VerifyEmailPage'
import {
  accountLoader,
  adminDashboardLoader,
  auctionDetailsLoader,
  auctionsLoader,
  calendarLoader,
  cataloguesRedirectLoader,
  guestOnlyLoader,
  landingLoader,
  lotsLoader,
  myRequestsLoader,
  requestBidLoader,
  requestedLotsLoader,
  reviewRequestsLoader,
  rootLoader,
} from './loaders'
import { paths } from './paths'

const pageLoading = <PageLoading />

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    loader: rootLoader,
    // The session is loaded once; sign-in and sign-out keep it current from then on.
    shouldRevalidate: () => false,
    hydrateFallbackElement: pageLoading,
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
          { path: paths.lots, loader: lotsLoader, element: <LotsPage />, hydrateFallbackElement: pageLoading },
          { path: paths.catalogues, loader: cataloguesRedirectLoader },
          {
            path: paths.calendar,
            loader: calendarLoader,
            element: <CalendarPage />,
            hydrateFallbackElement: pageLoading,
          },
          {
            path: paths.requestedLots,
            loader: requestedLotsLoader,
            element: <RequestedLotsPage />,
            hydrateFallbackElement: pageLoading,
          },
          {
            path: paths.requestBid,
            loader: requestBidLoader,
            element: <RequestBidPage />,
            hydrateFallbackElement: pageLoading,
          },
          {
            path: paths.myRequests,
            loader: myRequestsLoader,
            element: <MyRequestsPage />,
            hydrateFallbackElement: pageLoading,
          },
          {
            // Every administration page checks the role in its loader; the API checks it again.
            path: paths.admin,
            element: <AdminLayout />,
            children: [
              { index: true, loader: adminDashboardLoader, element: <AdminDashboardPage />, hydrateFallbackElement: pageLoading },
              { path: 'requests', loader: reviewRequestsLoader, element: <ReviewRequestsPage />, hydrateFallbackElement: pageLoading },
            ],
          },
          { path: paths.signIn, loader: guestOnlyLoader, element: <SignInPage />, hydrateFallbackElement: pageLoading },
          {
            path: paths.register,
            loader: guestOnlyLoader,
            element: <RegisterPage />,
            hydrateFallbackElement: pageLoading,
          },
          { path: paths.forgotPassword, element: <ForgotPasswordPage /> },
          { path: paths.resetPassword, element: <ResetPasswordPage /> },
          { path: paths.verifyEmail, element: <VerifyEmailPage /> },
          {
            path: paths.account,
            loader: accountLoader,
            element: <AccountPage />,
            hydrateFallbackElement: pageLoading,
          },
          { path: paths.terms, element: <TermsPage /> },
          { path: paths.privacy, element: <PrivacyPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
