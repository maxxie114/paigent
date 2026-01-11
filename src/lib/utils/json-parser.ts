/**
 * Safe JSON Parser
 *
 * @description Utilities for safely extracting and parsing JSON from LLM outputs.
 * LLMs often wrap JSON in prose, code fences, or return malformed JSON.
 *
 * @see paigent-studio-spec.md Appendix A.1
 */

/**
 * Extract the first top-level JSON object or array from a string.
 *
 * @description This is defensive against models that wrap JSON in prose or code fences.
 * Uses bracket balancing to find valid JSON boundaries.
 *
 * @param text - The text potentially containing JSON.
 * @returns The parsed JSON value, or undefined if no valid JSON found.
 *
 * @example
 * ```typescript
 * // Handles JSON wrapped in prose
 * extractFirstJsonValue("Here's the result: {\"key\": \"value\"} Hope this helps!");
 * // Returns: { key: "value" }
 *
 * // Handles code fences
 * extractFirstJsonValue("```json\n{\"key\": \"value\"}\n```");
 * // Returns: { key: "value" }
 *
 * // Returns undefined for invalid JSON
 * extractFirstJsonValue("No JSON here");
 * // Returns: undefined
 * ```
 */
export function extractFirstJsonValue(text: string): unknown | undefined {
  const trimmed = text.trim();

  // Remove common code fence markers
  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Fast-path: already pure JSON
  if (
    (withoutFences.startsWith("{") && withoutFences.endsWith("}")) ||
    (withoutFences.startsWith("[") && withoutFences.endsWith("]"))
  ) {
    try {
      return JSON.parse(withoutFences);
    } catch {
      // fall through to bracket balancing
    }
  }

  // Best-effort scan for a JSON object/array using bracket balancing
  const starts = ["{", "["] as const;
  for (const start of starts) {
    const open = start;
    const close = start === "{" ? "}" : "]";

    let depth = 0;
    let inString = false;
    let escape = false;
    let begin = -1;

    for (let i = 0; i < withoutFences.length; i++) {
      const ch = withoutFences[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === open) {
        if (depth === 0) begin = i;
        depth++;
      } else if (ch === close) {
        depth--;
        if (depth === 0 && begin !== -1) {
          const candidate = withoutFences.slice(begin, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            begin = -1;
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Try to repair common JSON errors.
 *
 * @description Attempts to fix common JSON formatting issues from LLMs:
 * - Trailing commas
 * - Single quotes instead of double quotes
 * - Unquoted keys
 * - Missing quotes on string values
 *
 * @param text - The potentially malformed JSON string.
 * @returns The repaired JSON string, or the original if unfixable.
 */
export function repairJson(text: string): string {
  let repaired = text;

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

  // Replace single quotes with double quotes (naive approach)
  // This is imperfect but helps with some common cases
  repaired = repaired.replace(/'/g, '"');

  // Try to quote unquoted keys
  repaired = repaired.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g,
    '$1"$2"$3'
  );

  return repaired;
}

/**
 * Extract JSON with repair attempts.
 *
 * @description First tries to extract JSON normally, then attempts repair
 * if the initial extraction fails. Also handles edge cases like empty strings
 * and provides better diagnostic information.
 *
 * @param text - The text potentially containing JSON.
 * @param options - Optional configuration for extraction.
 * @param options.debug - If true, log diagnostic information on failure.
 * @returns The parsed JSON value, or undefined if extraction fails.
 */
export function extractJsonWithRepair(
  text: string,
  options?: { debug?: boolean }
): unknown | undefined {
  // Handle empty or whitespace-only input
  if (!text || text.trim().length === 0) {
    if (options?.debug) {
      console.warn("[JSON Parser] Input is empty or whitespace-only");
    }
    return undefined;
  }

  // Try normal extraction first
  const direct = extractFirstJsonValue(text);
  if (direct !== undefined) {
    return direct;
  }

  // Try with repairs
  const repaired = repairJson(text);
  const fromRepaired = extractFirstJsonValue(repaired);
  if (fromRepaired !== undefined) {
    return fromRepaired;
  }

  // Last resort: try to find JSON between common wrapper patterns
  const lastResort = extractJsonFromWrappers(text);
  if (lastResort !== undefined) {
    return lastResort;
  }

  if (options?.debug) {
    // Log diagnostic information for debugging
    console.warn("[JSON Parser] Failed to extract JSON from response");
    console.warn("[JSON Parser] Input length:", text.length);
    console.warn("[JSON Parser] First 500 chars:", text.slice(0, 500));
    console.warn("[JSON Parser] Last 500 chars:", text.slice(-500));
  }

  return undefined;
}

/**
 * Extract JSON from common LLM wrapper patterns.
 *
 * @description Handles cases where LLMs wrap JSON in markdown, XML-style tags,
 * or other common patterns that the standard extraction might miss.
 *
 * @param text - The text potentially containing wrapped JSON.
 * @returns The parsed JSON value, or undefined if extraction fails.
 */
function extractJsonFromWrappers(text: string): unknown | undefined {
  // Common wrapper patterns that LLMs might use
  const patterns = [
    // Markdown code blocks with various language tags
    /```(?:json|JSON|javascript|js|typescript|ts)?\s*\n?([\s\S]*?)\n?```/,
    // XML-style tags
    /<json>([\s\S]*?)<\/json>/i,
    /<output>([\s\S]*?)<\/output>/i,
    /<response>([\s\S]*?)<\/response>/i,
    // Quoted JSON
    /"(\\{[\s\S]*?\\})"/,
    // After "Here is" or similar phrases
    /(?:here(?:'s| is) (?:the )?(?:json|output|response|result):?\s*)([\s\S]*)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Unescape if it was a quoted string
      const unescaped = candidate.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

      try {
        return JSON.parse(unescaped);
      } catch {
        // Try with bracket extraction
        const extracted = extractFirstJsonValue(unescaped);
        if (extracted !== undefined) {
          return extracted;
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract multiple JSON objects from text.
 *
 * @description Finds all top-level JSON objects or arrays in the text.
 * Useful when LLMs return multiple JSON blocks.
 *
 * @param text - The text potentially containing multiple JSON values.
 * @returns Array of parsed JSON values.
 */
export function extractAllJsonValues(text: string): unknown[] {
  const results: unknown[] = [];
  const trimmed = text.trim();

  const starts = ["{", "["] as const;

  for (const start of starts) {
    const open = start;
    const close = start === "{" ? "}" : "]";

    let depth = 0;
    let inString = false;
    let escape = false;
    let begin = -1;
    let searchStart = 0;

    while (searchStart < trimmed.length) {
      let foundInThisPass = false;

      for (let i = searchStart; i < trimmed.length; i++) {
        const ch = trimmed[i];

        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\") {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (ch === open) {
          if (depth === 0) begin = i;
          depth++;
        } else if (ch === close) {
          depth--;
          if (depth === 0 && begin !== -1) {
            const candidate = trimmed.slice(begin, i + 1);
            try {
              const parsed = JSON.parse(candidate);
              results.push(parsed);
              searchStart = i + 1;
              foundInThisPass = true;
              begin = -1;
              depth = 0;
              break;
            } catch {
              begin = -1;
              depth = 0;
            }
          }
        }
      }

      if (!foundInThisPass) break;
    }
  }

  return results;
}

/**
 * Safely stringify a value to JSON.
 *
 * @description Handles circular references and BigInt values.
 *
 * @param value - The value to stringify.
 * @param space - Number of spaces for indentation.
 * @returns The JSON string representation.
 */
export function safeStringify(value: unknown, space?: number): string {
  const seen = new WeakSet();

  return JSON.stringify(
    value,
    (key, val) => {
      // Handle BigInt
      if (typeof val === "bigint") {
        return val.toString();
      }

      // Handle circular references
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) {
          return "[Circular]";
        }
        seen.add(val);
      }

      return val;
    },
    space
  );
}
