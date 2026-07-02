// ============================================================
// index.ts — Cloudflare Worker entry point
//
// Routes:
//   OPTIONS *          → CORS preflight
//   POST /api/chat     → Agentic chat (chatHandler)
//   POST /api/upload   → Document upload (uploadHandler)
//   DELETE /api/session/:id → Clear session
//   GET  /*            → Static assets (frontend)
// ============================================================

import type { Env } from "./types.js";
import { handleChat } from "./handlers/chatHandler.js";
import { handleUpload } from "./handlers/uploadHandler.js";
import { corsHeaders, errorResponse, jsonResponse } from "./handlers/helpers.js";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // ----------------------------------------------------------
    // CORS preflight
    // ----------------------------------------------------------
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    // ----------------------------------------------------------
    // API routes
    // ----------------------------------------------------------
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(url, method, request, env);
    }

    // ----------------------------------------------------------
    // Static assets — serve the frontend
    // ----------------------------------------------------------
    return env.ASSETS.fetch(request);
  },
};

// ----------------------------------------------------------
// API router
// ----------------------------------------------------------
async function handleApiRequest(
  url: URL,
  method: string,
  request: Request,
  env: Env
): Promise<Response> {
  const headers = corsHeaders(request);

  // POST /api/chat
  if (url.pathname === "/api/chat" && method === "POST") {
    return handleChat(request, env);
  }

  // POST /api/upload
  if (url.pathname === "/api/upload" && method === "POST") {
    return handleUpload(request, env);
  }

  // DELETE /api/session/:id
  if (url.pathname.startsWith("/api/session/") && method === "DELETE") {
    const sessionId = url.pathname.split("/api/session/")[1];
    if (!sessionId) return errorResponse("Session ID required", 400, headers);
    await env.SESSIONS.delete(sessionId);
    return jsonResponse({ deleted: true, sessionId }, 200, headers);
  }

  // GET /api/health
  if (url.pathname === "/api/health" && method === "GET") {
    return jsonResponse(
      {
        status: "ok",
        service: "Omani Judicial AI Assistant",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      },
      200,
      headers
    );
  }

  return errorResponse("Not found", 404, headers);
}
