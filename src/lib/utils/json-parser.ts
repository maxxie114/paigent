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
 * if the initial extraction fails.
 *
 * @param text - The text potentially containing JSON.
 * @returns The parsed JSON value, or undefined if extraction fails.
 */
export function extractJsonWithRepair(text: string): unknown | undefined {
  // Try normal extraction first
  const direct = extractFirstJsonValue(text);
  if (direct !== undefined) {
    return direct;
  }

  // Try with repairs
  const repaired = repairJson(text);
  return extractFirstJsonValue(repaired);
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
