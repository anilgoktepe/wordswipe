/**
 * backend/middleware/requestId.ts
 *
 * Attaches a unique request ID to every incoming request.
 *
 * The ID is:
 *   • Stored on `res.locals.requestId` for use in route handlers and logging.
 *   • Returned to the client as the `X-Request-Id` response header so that
 *     clients and support can correlate a specific request in server logs.
 *
 * Uses `crypto.randomUUID()` — available natively in Node 14.17+, no extra
 * packages required.
 */

import { randomUUID }                       from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export function requestIdMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

/** Helper used in route handlers to retrieve the current request ID. */
export function getRequestId(res: Response): string {
  return typeof res.locals.requestId === 'string'
    ? res.locals.requestId
    : 'unknown';
}
