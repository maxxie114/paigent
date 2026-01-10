/**
 * VoyageAI Embeddings Client
 *
 * @description Client for generating embeddings using VoyageAI API.
 * Used for tool discovery with Atlas Vector Search.
 *
 * @see https://docs.voyageai.com/reference/embeddings-api
 */

/**
 * VoyageAI API endpoint.
 */
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

/**
 * Available VoyageAI models.
 */
export const VOYAGE_MODELS = {
  /** Large model - best accuracy, 1024 dimensions. */
  LARGE_2: "voyage-large-2",
  /** Code model - optimized for code. */
  CODE_2: "voyage-code-2",
  /** Light model - faster, smaller. */
  LIGHT_2: "voyage-lite-02-instruct",
} as const;

/**
 * Default model for embeddings.
 */
export const DEFAULT_VOYAGE_MODEL = VOYAGE_MODELS.LARGE_2;

/**
 * Input type for embeddings.
 */
export type EmbeddingInputType = "document" | "query";

/**
 * Embedding result for a single input.
 */
export type EmbeddingResult = {
  /** The embedding vector. */
  embedding: number[];
  /** Index of the input. */
  index: number;
};

/**
 * Full response from VoyageAI API.
 */
export type VoyageResponse = {
  /** Array of embedding results. */
  data: EmbeddingResult[];
  /** Model used. */
  model: string;
  /** Token usage. */
  usage: {
    totalTokens: number;
  };
};

/**
 * Check if VoyageAI is configured.
 *
 * @returns True if API key is set.
 */
export function isVoyageConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

/**
 * Generate embeddings using VoyageAI.
 *
 * @description Creates vector embeddings for the given texts.
 * Uses the voyage-large-2 model by default (1024 dimensions).
 *
 * @param texts - Array of texts to embed.
 * @param inputType - Whether inputs are documents or queries.
 * @param model - The model to use.
 * @returns Array of embedding vectors.
 *
 * @throws {Error} If VOYAGE_API_KEY is not set or API call fails.
 *
 * @example
 * ```typescript
 * // Embed documents for storage
 * const docEmbeddings = await generateEmbeddings(
 *   ["Tool A does X", "Tool B does Y"],
 *   "document"
 * );
 *
 * // Embed query for search
 * const queryEmbedding = await generateEmbeddings(
 *   ["find a tool for X"],
 *   "query"
 * );
 * ```
 */
export async function generateEmbeddings(
  texts: string[],
  inputType: EmbeddingInputType = "document",
  model: string = DEFAULT_VOYAGE_MODEL
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY environment variable is not set. " +
        "Get your API key from https://dash.voyageai.com/"
    );
  }

  if (texts.length === 0) {
    return [];
  }

  // VoyageAI has a limit of 128 texts per request
  const MAX_BATCH_SIZE = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: batch,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `VoyageAI API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data: VoyageResponse = await response.json();

    // Sort by index and extract embeddings
    const sortedData = data.data.sort((a, b) => a.index - b.index);
    const embeddings = sortedData.map((item) => item.embedding);

    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

/**
 * Generate a single embedding.
 *
 * @description Convenience function for embedding a single text.
 *
 * @param text - The text to embed.
 * @param inputType - Whether input is a document or query.
 * @param model - The model to use.
 * @returns The embedding vector.
 */
export async function generateEmbedding(
  text: string,
  inputType: EmbeddingInputType = "document",
  model: string = DEFAULT_VOYAGE_MODEL
): Promise<number[]> {
  const embeddings = await generateEmbeddings([text], inputType, model);
  return embeddings[0];
}

/**
 * Calculate cosine similarity between two vectors.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Similarity score between -1 and 1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
