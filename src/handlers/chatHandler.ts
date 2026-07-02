// ============================================================
// handlers/chatHandler.ts — Main chat endpoint (agentic loop)
//
// POST /api/chat  { sessionId?, message, attachments? }
//
// Features:
//   • Retry with exponential backoff (3 attempts per model)
//   • Automatic model fallback chain if primary model fails
//   • All responses forced to Arabic
//   • Descriptive Arabic error messages surfaced to the user
//   • Graceful degradation — always returns a useful reply
// ============================================================

import type { Env, ChatRequest, ChatResponse, ChatMessage, Session } from "../types.js";
import {
  SYSTEM_PROMPT,
  GENERATION_CONFIG,
  SESSION_CONFIG,
  RETRY_CONFIG,
} from "../instructions.js";
import { buildToolSchemas, executeTool } from "../tools/index.js";
import { corsHeaders, errorResponse, jsonResponse } from "./helpers.js";

// ----------------------------------------------------------
// Use config from instructions.ts — edit there to change behaviour
const MODEL_CHAIN = RETRY_CONFIG.modelChain;

// ----------------------------------------------------------
// Arabic error / fallback messages
// ----------------------------------------------------------
const AR = {
  noReply:
    "عذراً، لم أتمكن من إنشاء رد مناسب. يرجى إعادة صياغة سؤالك أو تبسيطه.",
  maxRounds:
    "عذراً، استغرقت المعالجة وقتاً أطول من المعتاد. يرجى تقليل تعقيد الطلب وإعادة المحاولة.",
  networkError:
    "تعذّر الاتصال بخادم الذكاء الاصطناعي حالياً بسبب مشكلة في الشبكة. " +
    "يرجى الانتظار لحظة والمحاولة مجدداً.",
  allModelsFailed:
    "جميع نماذج الذكاء الاصطناعي غير متاحة مؤقتاً. " +
    "يرجى المحاولة بعد دقيقتين. إذا استمرت المشكلة، تواصل مع مسؤول النظام.",
  invalidJson:
    "صيغة الطلب غير صحيحة. يرجى التحقق من البيانات المرسلة.",
  emptyMessage:
    "الرسالة لا يمكن أن تكون فارغة. يرجى كتابة سؤالك أو طلبك.",
  timeout:
    "انتهت مهلة الاستجابة من نموذج الذكاء الاصطناعي. " +
    "جارٍ المحاولة بنموذج احتياطي...",
};

// ----------------------------------------------------------
// Generic AI runner — calls env.AI with any model string
// ----------------------------------------------------------
type AiRunner = {
  run(model: string, inputs: Record<string, unknown>): Promise<Record<string, unknown>>;
};

function getAiRunner(env: Env): AiRunner {
  return env.AI as unknown as AiRunner;
}

// ----------------------------------------------------------
// Retry helper — exponential backoff
// ----------------------------------------------------------
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 800
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === maxAttempts;
      if (!isLast) {
        // Exponential backoff: 800ms, 1600ms, 3200ms
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[Retry] attempt ${attempt}/${maxAttempts} failed — waiting ${delay}ms`,
          err instanceof Error ? err.message : String(err)
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ----------------------------------------------------------
// Single model call — wrapped with 25s timeout
// ----------------------------------------------------------
async function callModel(
  ai: AiRunner,
  model: string,
  messages: ChatMessage[],
  toolSchemas: unknown[]
): Promise<Record<string, unknown>> {
  const timer = setTimeout(() => {
    throw new Error(`استغرق النموذج ${model} وقتاً أطول من ${RETRY_CONFIG.aiCallTimeoutMs / 1000} ثانية`);
  }, RETRY_CONFIG.aiCallTimeoutMs);

  try {
    const result = await ai.run(model, {
      messages: messages.map((m) => ({
        role: m.role as string,
        content:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content),
      })),
      tools: toolSchemas,
      ...GENERATION_CONFIG,
    });
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ----------------------------------------------------------
// Session helpers
// ----------------------------------------------------------
async function loadSession(env: Env, id: string): Promise<Session | null> {
  try {
    const raw = await env.SESSIONS.get(id, "text");
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function saveSession(env: Env, session: Session): Promise<void> {
  try {
    await env.SESSIONS.put(session.id, JSON.stringify(session), {
      expirationTtl: SESSION_CONFIG.sessionTtlSeconds,
    });
  } catch (err) {
    // Non-fatal — log and continue
    console.error("[Session] failed to save:", err);
  }
}

function createSession(): Session {
  return {
    id: crypto.randomUUID(),
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function trimContext(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= SESSION_CONFIG.maxContextMessages) return messages;
  return messages.slice(messages.length - SESSION_CONFIG.maxContextMessages);
}

function buildMessages(
  session: Session,
  userMessage: string,
  attachmentContext: string
): ChatMessage[] {
  const systemMsg: ChatMessage = {
    role: "system",
    content: SYSTEM_PROMPT,
  };

  const history = trimContext(session.messages);

  const userContent =
    attachmentContext.length > 0
      ? `${userMessage}\n\n---\n[المستندات المرفقة]\n${attachmentContext}`
      : userMessage;

  const userMsg: ChatMessage = {
    role: "user",
    content: userContent,
  };

  return [systemMsg, ...history, userMsg];
}

// ----------------------------------------------------------
// Extract text from a model response object
// ----------------------------------------------------------
function extractReply(result: Record<string, unknown>): string | null {
  // result is typed as Record<string,unknown>, but at runtime it could be a plain string
  const raw = result as unknown;
  if (typeof raw === "string" && raw.trim()) return raw.trim();

  if (raw && typeof raw === "object") {
    const res = raw as Record<string, unknown>;
    const text = res["response"] ?? res["result"] ?? res["text"] ?? res["output"];
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return null;
}

// ----------------------------------------------------------
// Agentic loop — model fallback + retry per model
// ----------------------------------------------------------
async function runAgentLoop(
  messages: ChatMessage[],
  env: Env
): Promise<{ reply: string; toolsUsed: string[]; modelUsed: string }> {
  const toolSchemas = buildToolSchemas();
  const toolsUsed: string[] = [];
  const ai = getAiRunner(env);

  let lastError: string = AR.allModelsFailed;

  // Try each model in the fallback chain
  for (const model of MODEL_CHAIN) {
    console.log(`[Agent] trying model: ${model}`);

    // Up to 5 tool-call rounds per model attempt
    const localMessages = [...messages];

    try {
      for (let round = 0; round < 5; round++) {
        // Call model with retry
        let result: Record<string, unknown>;
        try {
          result = await withRetry(
            () => callModel(ai, model, localMessages, toolSchemas),
            RETRY_CONFIG.maxRetriesPerModel,
            RETRY_CONFIG.baseRetryDelayMs
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[Agent] model ${model} failed all retries: ${msg}`);
          lastError = isNetworkError(msg) ? AR.networkError : AR.allModelsFailed;
          break; // try next model
        }

        // Check for tool calls
        if (
          result &&
          typeof result === "object" &&
          "tool_calls" in result &&
          Array.isArray(result["tool_calls"]) &&
          result["tool_calls"].length > 0
        ) {
          for (const toolCall of result["tool_calls"] as Array<{ name: string; arguments?: Record<string, string> }>) {
            const toolName = toolCall.name as string;
            const toolArgs = (toolCall.arguments ?? {}) as Record<string, string>;
            toolsUsed.push(toolName);

            const toolResult = await executeTool(toolName, toolArgs, env);

            localMessages.push({
              role: "assistant",
              content: JSON.stringify({ tool_call: toolCall }),
            });
            localMessages.push({
              role: "tool",
              content: toolResult,
            });
          }
          continue; // next round with tool results fed back
        }

        // Extract final reply
        const reply = extractReply(result);
        if (reply) {
          return { reply, toolsUsed, modelUsed: model };
        }

        // Empty response — break out of rounds and try next model
        console.warn(`[Agent] model ${model} returned empty reply on round ${round}`);
        break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Agent] unexpected error with ${model}: ${msg}`);
      lastError = isNetworkError(msg) ? AR.networkError : lastError;
    }

    // Small pause before trying next model
    await sleep(300);
  }

  // All models exhausted
  console.error("[Agent] all models in fallback chain failed");
  return { reply: lastError, toolsUsed, modelUsed: "none" };
}

// ----------------------------------------------------------
// Detect network-type errors
// ----------------------------------------------------------
function isNetworkError(msg: string): boolean {
  const networkKeywords = [
    "fetch failed",
    "network",
    "connection",
    "timeout",
    "econnrefused",
    "enotfound",
    "abort",
    "etimedout",
    "socket",
  ];
  const lower = msg.toLowerCase();
  return networkKeywords.some((kw) => lower.includes(kw));
}

// ----------------------------------------------------------
// Main handler
// ----------------------------------------------------------
export async function handleChat(request: Request, env: Env): Promise<Response> {
  const headers = corsHeaders(request);

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return errorResponse(AR.invalidJson, 400, headers);
  }

  if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
    return errorResponse(AR.emptyMessage, 400, headers);
  }

  // Load or create session
  let session: Session;
  if (body.sessionId) {
    session = (await loadSession(env, body.sessionId)) ?? createSession();
  } else {
    session = createSession();
  }

  // Build attachment context
  let attachmentContext = "";
  if (body.attachments && body.attachments.length > 0) {
    const list = body.attachments
      .map((a) => `• ${a.name} (${a.mimeType}) — المعرف: ${a.id}`)
      .join("\n");
    attachmentContext =
      "لديك المستندات التالية مرفقة — استخدم أداة analyze_document للاطلاع عليها:\n" +
      list;
  }

  const messages = buildMessages(session, body.message.trim(), attachmentContext);

  // Run agentic loop with retry + fallback
  let reply: string;
  let toolsUsed: string[];
  let modelUsed: string;

  try {
    ({ reply, toolsUsed, modelUsed } = await runAgentLoop(messages, env));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Chat] fatal error:", msg);
    reply = isNetworkError(msg) ? AR.networkError : AR.allModelsFailed;
    toolsUsed = [];
    modelUsed = "none";
  }

  // Persist session (non-blocking — fire and forget)
  session.messages.push(
    { role: "user", content: body.message },
    { role: "assistant", content: reply }
  );
  session.updatedAt = Date.now();

  // Save in background — don't block the response
  const ctx = (env as unknown as { ctx?: ExecutionContext }).ctx;
  if (ctx?.waitUntil) {
    ctx.waitUntil(saveSession(env, session));
  } else {
    await saveSession(env, session);
  }

  const responseData: ChatResponse = {
    sessionId: session.id,
    reply,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
  };

  // Log for observability (visible in wrangler dev + Cloudflare logs)
  console.log(
    `[Chat] session=${session.id} model=${modelUsed} ` +
    `tools=${toolsUsed.length} msgLen=${body.message.length}`
  );

  return jsonResponse(responseData, 200, headers);
}
