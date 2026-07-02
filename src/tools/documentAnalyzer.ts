// ============================================================
// tools/documentAnalyzer.ts — Document summary & analysis tool
//
// Called when the model needs to deeply analyze an attached
// document stored in R2. Fetches the doc, decodes it, and
// returns structured content for the model to work with.
// ============================================================

import type { Tool, Env } from "../types.js";

// ----------------------------------------------------------
// Helper: decode ArrayBuffer → UTF-8 string
// ----------------------------------------------------------
function bufferToText(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(buffer);
}

// ----------------------------------------------------------
// Tool definition
// ----------------------------------------------------------
export const documentAnalyzerTool: Tool = {
  name: "analyze_document",
  description:
    "Retrieves and reads the content of an uploaded document from secure storage. " +
    "Use this when the user has attached a document and wants it summarized, analyzed, " +
    "or referenced in drafting. Returns the document text for your analysis.",

  parameters: {
    type: "object",
    required: ["documentId"],
    properties: {
      documentId: {
        type: "string",
        description: "The document ID returned after the user uploaded the file.",
      },
      task: {
        type: "string",
        enum: ["summarize", "extract_articles", "translate", "full_text"],
        description:
          "What to do with the document: summarize, extract legal articles, translate, or return full text.",
      },
    },
  },

  execute: async (args, env: Env): Promise<string> => {
    const { documentId, task = "full_text" } = args;

    if (!documentId) {
      return JSON.stringify({ error: "MISSING_ID", message: "لم يتم تحديد معرف المستند" });
    }

    try {
      const object = await env.DOCUMENTS.get(documentId);

      if (!object) {
        return JSON.stringify({
          error: "NOT_FOUND",
          message: `المستند غير موجود: ${documentId}`,
        });
      }

      const metadata = object.customMetadata ?? {};
      const mimeType = metadata["mimeType"] ?? "application/octet-stream";
      const fileName = metadata["fileName"] ?? "document";

      let content: string;

      // For text-based files, decode directly
      if (
        mimeType === "text/plain" ||
        mimeType === "application/json"
      ) {
        const buffer = await object.arrayBuffer();
        content = bufferToText(buffer);
      } else if (mimeType === "application/pdf") {
        // PDF: return base64 — the AI model handles vision/text extraction
        const buffer = await object.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        content = `[PDF_BASE64_START]${base64}[PDF_BASE64_END]`;
      } else if (mimeType.startsWith("image/")) {
        const buffer = await object.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        content = `[IMAGE_BASE64_START:${mimeType}]${base64}[IMAGE_BASE64_END]`;
      } else {
        const buffer = await object.arrayBuffer();
        content = bufferToText(buffer);
      }

      return JSON.stringify({
        documentId,
        fileName,
        mimeType,
        task,
        size: object.size,
        content: content.slice(0, 12000), // Limit for context window
        uploadedAt: object.uploaded?.toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: "READ_ERROR", message });
    }
  },
};
