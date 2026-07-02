// ============================================================
// handlers/helpers.ts — Shared HTTP utilities
// ============================================================

import { ALLOWED_ORIGINS } from "../instructions.js";
import type { ErrorResponse } from "../types.js";

// ----------------------------------------------------------
// CORS headers
// ----------------------------------------------------------
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (ALLOWED_ORIGINS as readonly string[]).includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// ----------------------------------------------------------
// Error response builder
// ----------------------------------------------------------
export function errorResponse(
  message: string,
  code: number,
  headers: Record<string, string> = {}
): Response {
  const body: ErrorResponse = { error: message, code };
  return new Response(JSON.stringify(body), {
    status: code,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });
}

// ----------------------------------------------------------
// JSON response builder
// ----------------------------------------------------------
export function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });
}
