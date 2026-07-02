// ============================================================
// handlers/uploadHandler.ts — Document upload endpoint
//
// POST /api/upload
//   Accepts multipart/form-data with a "file" field.
//   Validates MIME type and size against instructions.ts.
//   Stores the file in R2 with metadata.
//   Returns { id, name, mimeType, size }
// ============================================================

import type { Env, UploadResponse } from "../types.js";
import { DOCUMENT_CONFIG } from "../instructions.js";
import { corsHeaders, errorResponse } from "./helpers.js";

// ----------------------------------------------------------
// Generate a stable unique ID for a document
// ----------------------------------------------------------
async function generateDocId(name: string): Promise<string> {
  const data = new TextEncoder().encode(`${name}-${Date.now()}-${Math.random()}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16); // 16-char hex ID
}

// ----------------------------------------------------------
// Upload handler
// ----------------------------------------------------------
export async function handleUpload(
  request: Request,
  env: Env
): Promise<Response> {
  const headers = corsHeaders(request);

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Invalid multipart form data", 400, headers);
  }

  const fileRaw = formData.get("file");
  // In Workers, uploaded files are exposed as File (a Blob subtype)
  if (!fileRaw || typeof (fileRaw as unknown as { size?: number }).size !== "number") {
    return errorResponse("No file provided. Send a 'file' field.", 400, headers);
  }
  const file = fileRaw as unknown as File;

  // Validate MIME type
  if (!DOCUMENT_CONFIG.allowedMimeTypes.includes(file.type as never)) {
    return errorResponse(
      `نوع الملف غير مدعوم: ${file.type}. الأنواع المدعومة: ${DOCUMENT_CONFIG.allowedMimeTypes.join(", ")}`,
      415,
      headers
    );
  }

  // Validate file size
  if (file.size > DOCUMENT_CONFIG.maxFileSizeBytes) {
    const maxMb = DOCUMENT_CONFIG.maxFileSizeBytes / 1024 / 1024;
    return errorResponse(
      `حجم الملف يتجاوز الحد المسموح به (${maxMb} MB)`,
      413,
      headers
    );
  }

  // Generate ID and store in R2
  const docId = await generateDocId(file.name);
  const arrayBuffer = await file.arrayBuffer();

  await env.DOCUMENTS.put(docId, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      fileName: file.name,
      mimeType: file.type,
      uploadedAt: new Date().toISOString(),
    },
  });

  const response: UploadResponse = {
    id: docId,
    name: file.name,
    mimeType: file.type,
    size: file.size,
  };

  return new Response(JSON.stringify(response), {
    status: 201,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });
}
