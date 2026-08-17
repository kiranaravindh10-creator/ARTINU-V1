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
    {
      path: 'reset-password',
      element: lazyPage(() => import('@/features/auth/pages/ResetPasswordPage')),
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
    { path: 'register/space', element: <Navigate to="/lets-talk" replace /> },
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
          path: 'content',
          element: <ModuleRoute module="system" />,
          children: [
            {
              index: true,
              element: lazyPage(() => import('@/features/console/pages/ConsoleContentPage')),
            },
            {
              path: 'manager',
              element: lazyPage(() => import('@/features/console/pages/ConsoleContentManagerPage')),
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

export const router = createBrowserRouter([
  authRoutes,
  accountRoutes,
  spaceRoutes,
  artistRoutes,
  consoleRoutes,
  { path: '/', ...publicRoutes },
]);
