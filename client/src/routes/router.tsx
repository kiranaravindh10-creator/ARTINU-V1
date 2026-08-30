import { INTERNAL_ROLES, type Role } from '@artinu/shared';
import * as React from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { GuestOnlyRoute, ModuleRoute, ProtectedRoute } from '@/routes/guards';
import { RouteError, RouteFallback } from '@/routes/route-states';

/**
 * Every screen is a default-exported component, lazily loaded. The route tree
 * mirrors the SDD modules: public website, Space Experience, Artist Experience
 * and the ARTINU Console.
 */
const lazyPage = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const Component = React.lazy(loader);
  return (
    <React.Suspense fallback={<RouteFallback />}>
      <Component />
    </React.Suspense>
  );
};

const INTERNAL = INTERNAL_ROLES as unknown as Role[];

// ── Public website (SDD Module 1) ────────────────────────────────────────────
const publicRoutes: RouteObject = {
  element: <PublicLayout />,
  errorElement: <RouteError />,
  children: [
    { index: true, element: lazyPage(() => import('@/features/public/pages/HomePage')) },
    { path: 'spaces', element: lazyPage(() => import('@/features/public/pages/SpacesPage')) },
    { path: 'gallery', element: lazyPage(() => import('@/features/public/pages/GalleryPage')) },
    {
      path: 'gallery/:artworkId',
      element: lazyPage(() => import('@/features/public/pages/ArtworkDetailPage')),
    },
    { path: 'artists', element: lazyPage(() => import('@/features/public/pages/ArtistsPage')) },
    {
      path: 'artists/:slug',
      element: lazyPage(() => import('@/features/public/pages/ArtistProfilePage')),
    },
    { path: 'about', element: lazyPage(() => import('@/features/public/pages/AboutPage')) },
    { path: 'lets-talk', element: lazyPage(() => import('@/features/public/pages/LetsTalkPage')) },
    { path: 'join', element: lazyPage(() => import('@/features/public/pages/JoinPage')) },
    { path: 'join/apply', element: lazyPage(() => import('@/features/public/pages/ApplyPage')) },
    {
      path: 'join/submitted',
      element: lazyPage(() => import('@/features/public/pages/ApplicationSubmittedPage')),
    },
    { path: 'legal/:document', element: lazyPage(() => import('@/features/public/pages/LegalPage')) },
    { path: 'help', element: lazyPage(() => import('@/features/public/pages/HelpPage')) },
    { path: '*', element: lazyPage(() => import('@/features/public/pages/NotFoundPage')) },
  ],
};

// ── Authentication ───────────────────────────────────────────────────────────
const authRoutes: RouteObject = {
  element: <GuestOnlyRoute />,
  errorElement: <RouteError />,
  children: [
    { path: 'signin', element: lazyPage(() => import('@/features/auth/pages/SignInPage')) },
    { path: 'signin/verify', element: lazyPage(() => import('@/features/auth/pages/VerifyOtpPage')) },
    {
      path: 'forgot-password',
      element: lazyPage(() => import('@/features/auth/pages/ForgotPasswordPage')),
    },
    { path: 'register', element: <Navigate to="/register/artist" replace /> },
    {
      path: 'register/artist',
      element: lazyPage(() => import('@/features/auth/pages/ArtistRegisterPage')),
    },
    {
      path: 'register/artphiles',
      element: lazyPage(() => import('@/features/auth/pages/ArtPhilesRegisterPage')),
    },
    /*
      Space owner sign-up.

      This was `<Navigate to="/lets-talk" />` — the page and the API endpoint both
      existed, but the route sent anyone who reached it to the consultation form
      instead, so there was no way to actually register a space owner.
    */
    {
      path: 'register/space',
      element: lazyPage(() => import('@/features/auth/pages/SpaceRegisterPage')),
    },
  ],
};

/**
 * Signed-in but role-agnostic. `/account/password` is the one page a space
 * owner holding an ARTINU-issued password may reach before changing it, so it
 * cannot sit under any role-scoped branch — ProtectedRoute lets exactly this
 * path through when `mustChangePassword` is set.
 */
const accountRoutes: RouteObject = {
  path: 'account',
  element: <ProtectedRoute />,
  errorElement: <RouteError />,
  children: [
    {
      path: 'password',
      element: lazyPage(() => import('@/features/auth/pages/ChangePasswordPage')),
    },
  ],
};

// ── Space Experience (SDD Module 2) ──────────────────────────────────────────
const spaceRoutes: RouteObject = {
  path: 'space',
  element: <ProtectedRoute roles={['space_owner']} />,
  errorElement: <RouteError />,
  children: [
    {
      element: lazyPage(() => import('@/features/space/SpaceLayout')),
      children: [
        { index: true, element: lazyPage(() => import('@/features/space/pages/SpaceDashboardPage')) },
        {
          path: 'register-space',
          element: lazyPage(() => import('@/features/space/pages/RegisterSpacePage')),
        },
        {
          path: 'collections',
          element: lazyPage(() => import('@/features/space/pages/CollectionsPage')),
        },
        { path: 'wishlist', element: lazyPage(() => import('@/features/space/pages/WishlistPage')) },
        { path: 'cart', element: lazyPage(() => import('@/features/space/pages/CartPage')) },
        { path: 'checkout', element: lazyPage(() => import('@/features/space/pages/CheckoutPage')) },
        {
          path: 'payment/:paymentId',
          element: lazyPage(() => import('@/features/space/pages/PaymentPage')),
        },
        { path: 'orders', element: lazyPage(() => import('@/features/space/pages/OrdersPage')) },
        {
          path: 'orders/:orderId',
          element: lazyPage(() => import('@/features/space/pages/OrderTrackingPage')),
        },
        { path: 'rotation', element: lazyPage(() => import('@/features/space/pages/RotationPage')) },
        { path: 'invoices', element: lazyPage(() => import('@/features/space/pages/InvoicesPage')) },
        { path: 'support', element: lazyPage(() => import('@/features/space/pages/SupportPage')) },
        {
          path: 'notifications',
          element: lazyPage(() => import('@/features/shared/pages/NotificationsPage')),
        },
        { path: 'profile', element: lazyPage(() => import('@/features/shared/pages/ProfilePage')) },
      ],
    },
  ],
};

// ── Artist Experience (SDD Module 3) ─────────────────────────────────────────
const artistRoutes: RouteObject = {
  path: 'studio',
  element: <ProtectedRoute roles={['artist']} />,
  errorElement: <RouteError />,
  children: [
    {
      element: lazyPage(() => import('@/features/artist/ArtistLayout')),
      children: [
        {
          index: true,
          element: lazyPage(() => import('@/features/artist/pages/ArtistWorkspacePage')),
        },
        { path: 'upload', element: lazyPage(() => import('@/features/artist/pages/ArtistUploadPage')) },
        {
          path: 'submissions',
          element: lazyPage(() => import('@/features/artist/pages/ArtistSubmissionsPage')),
        },
        {
          path: 'portfolio',
          element: lazyPage(() => import('@/features/artist/pages/ArtistPortfolioPage')),
        },
        {
          path: 'installations',
          element: lazyPage(() => import('@/features/artist/pages/ArtistInstallationsPage')),
        },
        {
          path: 'notifications',
          element: lazyPage(() => import('@/features/shared/pages/NotificationsPage')),
        },
        { path: 'profile', element: lazyPage(() => import('@/features/shared/pages/ProfilePage')) },
      ],
    },
  ],
};

// ── ARTINU Console (SDD Module 4) ────────────────────────────────────────────
const consoleRoutes: RouteObject = {
  path: 'console',
  element: <ProtectedRoute roles={INTERNAL} />,
  errorElement: <RouteError />,
  children: [
    {
      element: lazyPage(() => import('@/features/console/ConsoleLayout')),
      children: [
        {
          index: true,
          element: lazyPage(() => import('@/features/console/pages/ConsoleOverviewPage')),
        },
        {
          path: 'orders',
          element: <ModuleRoute module="orders" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleOrdersPage')),
            },
            {
              path: ':orderId',
              element: lazyPage(() => import('@/features/console/pages/ConsoleOrderDetailPage')),
            },
          ],
        },
        {
          path: 'moderation',
          element: <ModuleRoute module="moderation" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleModerationPage')),
            },
          ],
        },
        {
          path: 'artists',
          element: <ModuleRoute module="artists" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleArtistsPage')),
            },
            {
              path: 'featured',
              element: lazyPage(() => import('@/features/console/pages/ConsoleFeaturedArtistsPage')),
            },
            {
              path: 'applications',
              element: lazyPage(() => import('@/features/console/pages/ConsoleApplicationsPage')),
            },
            {
              // One photographer's Community Guidelines record: warnings,
              // enforcement, and what they have uploaded. Reached from the
              // artists list rather than the sidebar — it is about a person,
              // not a section.
              path: ':artistId/moderation',
              element: lazyPage(
                () => import('@/features/console/pages/ConsoleModerationCasePage'),
              ),
            },
          ],
        },
        {
          path: 'spaces',
          element: <ModuleRoute module="spaces" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleSpacesPage')),
            },
            {
              path: 'consultations',
              element: lazyPage(() => import('@/features/console/pages/ConsoleConsultationsPage')),
            },
          ],
        },
        {
          path: 'printing',
          element: <ModuleRoute module="printing" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsolePrintingPage')),
            },
          ],
        },
        {
          path: 'payments',
          element: <ModuleRoute module="payments" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsolePaymentsPage')),
            },
          ],
        },
        {
          path: 'accounts',
          element: <ModuleRoute module="accounts" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleAccountsPage')),
            },
          ],
        },
        {
          path: 'reports',
          element: <ModuleRoute module="reports" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleReportsPage')),
            },
          ],
        },
        {
          path: 'users',
          element: <ModuleRoute module="users" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleUsersPage')),
            },
            {
              path: 'employees',
              element: lazyPage(() => import('@/features/console/pages/ConsoleEmployeesPage')),
            },
            {
              path: 'audit',
              element: lazyPage(() => import('@/features/console/pages/ConsoleAuditPage')),
            },
          ],
        },
        {
          path: 'frames',
          element: <ModuleRoute module="printing" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleFramesPage')),
            },
          ],
        },
        {
          path: 'notifications',
          element: <ModuleRoute module="announcements" />,
          children: [
            {
              index: true,
              element: lazyPage(
                () => import('@/features/console/pages/ConsoleAnnouncementsPage'),
              ),
            },
          ],
        },
        {
          path: 'content',
          element: <ModuleRoute module="content" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleContentPage')),
            },
            {
              path: 'manager',
              element: lazyPage(() => import('@/features/console/pages/ConsoleContentManagerPage')),
            },
            {
              // Under `content` because that is the only module manager, IT and
              // CEO all have — the three roles the announcement feature is for.
              path: 'announcements',
              element: lazyPage(
                () => import('@/features/console/pages/ConsoleAnnouncementsPage'),
              ),
            },
          ],
        },
        {
          path: 'system',
          element: <ModuleRoute module="system" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleSystemPage')),
            },
            {
              path: 'mail',
              element: lazyPage(() => import('@/features/console/pages/ConsoleMailPage')),
            },
          ],
        },
        {
          path: 'notifications',
          element: lazyPage(() => import('@/features/shared/pages/NotificationsPage')),
        },
        { path: 'profile', element: lazyPage(() => import('@/features/shared/pages/ProfilePage')) },
      ],
    },
  ],
};

/*
  Email confirmation, outside every guard.

  Two things had to be true and neither was. First, the route has to exist: the
  verification email has always linked to `/verify-email?token=…` and nothing was
  registered for that path, so every "Confirm email" button ARTINU ever sent
  landed on the 404 page.

  Second, it must not be guest-only. Registration signs the new owner in
  immediately, so the person clicking the link in their inbox is almost always
  already authenticated — inside `authRoutes` the GuestOnlyRoute wrapper would
  have redirected them away from the page whose entire job is to consume their
  token. It gets its own entry rather than joining a group for that reason.
*/
const verifyEmailRoute: RouteObject = {
  path: 'verify-email',
  errorElement: <RouteError />,
  element: lazyPage(() => import('@/features/auth/pages/VerifyEmailPage')),
};

/*
  Setting a new password, for exactly the same reason as verify-email above.

  This lived inside `authRoutes`, wrapped in GuestOnlyRoute, and the guard is
  wrong here. "Guest only" assumes anyone resetting a password is signed out,
  and that is not who clicks these links. The person who clicks is very often
  signed in already - on this machine, on an old session, or on the wrong
  account entirely, which is frequently WHY they are resetting. GuestOnlyRoute
  redirects them straight to a dashboard, the token is never consumed, and the
  reset link looks broken while being perfectly valid. The token then expires an
  hour later having never been used.

  `forgot-password` stays guest-only: that one you reach by choosing it, and if
  you are already signed in you do not need it.
*/
const resetPasswordRoute: RouteObject = {
  path: 'reset-password',
  errorElement: <RouteError />,
  element: lazyPage(() => import('@/features/auth/pages/ResetPasswordPage')),
};

export const router = createBrowserRouter([
  verifyEmailRoute,
  resetPasswordRoute,
  authRoutes,
  accountRoutes,
  spaceRoutes,
  artistRoutes,
  consoleRoutes,
  { path: '/', ...publicRoutes },
]);
