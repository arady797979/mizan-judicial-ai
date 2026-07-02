// ============================================================
// types.ts — Shared TypeScript types across the application
// ============================================================

/** Cloudflare bindings declared in wrangler.jsonc */
export interface Env {
  AI: Ai;
  SESSIONS: KVNamespace;
  DOCUMENTS: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

// ----------------------------------------------------------
// Chat message types
// ----------------------------------------------------------

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "document";
  text?: string;
  document?: DocumentReference;
}

export interface DocumentReference {
  id: string;
  name: string;
  mimeType: string;
  /** Base64-encoded content for inline passing to AI */
  content?: string;
}

// ----------------------------------------------------------
// Session
// ----------------------------------------------------------

export interface Session {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------
// Tool types
// ----------------------------------------------------------

export interface Tool {
  /** Unique name matching the AI tool-call spec */
  name: string;
  /** Short description shown to the model */
  description: string;
  /** JSON Schema for the tool's input parameters */
  parameters: Record<string, unknown>;
  /** The actual implementation — called when the model invokes this tool */
  execute: (args: Record<string, string>, env: Env) => Promise<string>;
}

// ----------------------------------------------------------
// API Request / Response shapes
// ----------------------------------------------------------

export interface ChatRequest {
  sessionId?: string;
  message: string;
  attachments?: AttachmentMeta[];
}

export interface AttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  toolsUsed?: string[];
}

export interface UploadResponse {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ErrorResponse {
  error: string;
  code: number;
}

// ----------------------------------------------------------
// AI helpers
// ----------------------------------------------------------

/** Maps a MIME type to a human-readable label */
export function mimeLabel(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "text/plain": "نص",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "image/jpeg": "صورة",
    "image/png": "صورة",
  };
  return map[mime] ?? "ملف";
}
