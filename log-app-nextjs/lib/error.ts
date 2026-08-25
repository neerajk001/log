import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

/**
 * Centralized error → JSON mapping. All Route Handlers funnel errors here
 * so the response shape matches docs/api.md. Unexpected errors are logged
 * server-side and never leak internals to the client.
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues[0]?.message ?? 'Invalid input',
        },
      },
      { status: 400 },
    );
  }
  console.error('[unhandled error]', err);
  return NextResponse.json(
    { error: { code: 'SERVER_ERROR', message: 'Internal server error' } },
    { status: 500 },
  );
}

/**
 * Require a verified Clerk session in a Route Handler. Returns the local
 * user id, or a 401 NextResponse if unauthenticated.
 */
import { auth } from '@clerk/nextjs/server';
import { findOrCreateUser } from '@/lib/auth';

export async function requireUserId(): Promise<string | NextResponse> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing session' } },
      { status: 401 },
    );
  }
  const user = await findOrCreateUser(clerkUserId);
  return user.id;
}
