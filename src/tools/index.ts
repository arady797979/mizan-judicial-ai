// ============================================================
// tools/index.ts — Tool registry
//
// Register all tools here. The chat handler will auto-build
// the tool schema list for the AI model from this registry.
// ============================================================

import type { Tool } from "../types.js";
import { documentAnalyzerTool } from "./documentAnalyzer.js";
import { legalDrafterTool } from "./legalDrafter.js";
import { lawCorpusTool } from "./lawCorpus.js";

/** All tools available to the AI model */
export const TOOLS: Tool[] = [
  documentAnalyzerTool,
  legalDrafterTool,
  lawCorpusTool,
];

/** Convert Tool[] to Cloudflare Workers AI tool schema format */
export function buildToolSchemas(): AiTextGenerationToolInput[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as {
        type: "object";
        properties: Record<string, { type: string; description?: string }>;
        required: string[];
      },
    },
  }));
}

/** Execute a tool call by name */
export async function executeTool(
  name: string,
  args: Record<string, string>,
  env: import("../types.js").Env
): Promise<string> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return JSON.stringify({
      error: "TOOL_NOT_FOUND",
      name,
      available: TOOLS.map((t) => t.name),
    });
  }
  return tool.execute(args, env);
}
