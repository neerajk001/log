import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on everything except Next static assets, the favicon, and /api/health.
    '/((?!_next/static|_next/image|favicon.ico|api/health).*)',
  ],
};
