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
 * Available VoyageAI embedding models.
 *
 * @description Current recommended models as of January 2026.
 * Each model has different characteristics for accuracy, speed, and use case.
 *
 * @see https://docs.voyageai.com/docs/embeddings
 */
export const VOYAGE_MODELS = {
  /**
   * voyage-3-large: Highest accuracy, 1024 dimensions by default.
   * Supports flexible dimensions: 2048, 1024, 512, 256.
   * Best for high-stakes retrieval tasks.
   */
  VOYAGE_3_LARGE: "voyage-3-large",

  /**
   * voyage-3.5: Balanced accuracy and speed, 1024 dimensions by default.
   * Supports flexible dimensions: 2048, 1024, 512, 256.
   * Good general-purpose model.
   */
  VOYAGE_3_5: "voyage-3.5",

  /**
   * voyage-3.5-lite: Fastest model, 1024 dimensions by default.
   * Supports flexible dimensions: 2048, 1024, 512, 256.
   * Best for latency-sensitive applications.
   */
  VOYAGE_3_5_LITE: "voyage-3.5-lite",

  /**
   * voyage-code-3: Optimized for code retrieval, 1024 dimensions by default.
   * Supports flexible dimensions: 2048, 1024, 512, 256.
   * Best for code search and understanding.
   */
  VOYAGE_CODE_3: "voyage-code-3",

  /**
   * voyage-finance-2: Specialized for finance domain.
   * Fixed dimension output.
   */
  VOYAGE_FINANCE_2: "voyage-finance-2",

  /**
   * voyage-law-2: Specialized for legal domain.
   * Fixed dimension output.
   */
  VOYAGE_LAW_2: "voyage-law-2",

  // Legacy models (deprecated but still functional)
  /** @deprecated Use VOYAGE_3_LARGE instead. */
  LARGE_2: "voyage-large-2",
  /** @deprecated Use VOYAGE_CODE_3 instead. */
  CODE_2: "voyage-code-2",
} as const;

/**
 * Default model for embeddings.
 *
 * @description Uses voyage-3-large for best accuracy.
 * Default output dimension is 1024.
 */
export const DEFAULT_VOYAGE_MODEL = VOYAGE_MODELS.VOYAGE_3_LARGE;

/**
 * Input type for embeddings.
 *
 * @description Specifies how the input text should be processed.
 * - `null`: Direct embedding without any prompt prefix.
 * - `query`: Prepends "Represent the query for retrieving supporting documents: "
 * - `document`: Prepends "Represent the document for retrieval: "
 *
 * For retrieval/search tasks, specify `query` for search queries and `document`
 * for documents to be searched. Embeddings with different input_types are compatible.
 */
export type EmbeddingInputType = "document" | "query" | null;

/**
 * Output data types supported by VoyageAI.
 *
 * @description Controls the precision and format of returned embeddings.
 * - `float`: 32-bit floating point (default, highest precision)
 * - `int8`: 8-bit signed integers (-128 to 127)
 * - `uint8`: 8-bit unsigned integers (0 to 255)
 * - `binary`: Bit-packed signed integers (1/8 dimension)
 * - `ubinary`: Bit-packed unsigned integers (1/8 dimension)
 *
 * Quantized types (int8, uint8, binary, ubinary) are only supported by
 * voyage-3-large, voyage-3.5, voyage-3.5-lite, and voyage-code-3.
 */
export type EmbeddingOutputDtype =
  | "float"
  | "int8"
  | "uint8"
  | "binary"
  | "ubinary";

/**
 * Supported output dimensions for flexible dimension models.
 *
 * @description Only voyage-3-large, voyage-3.5, voyage-3.5-lite, and voyage-code-3
 * support these dimension options. Other models use fixed dimensions.
 */
export type EmbeddingOutputDimension = 2048 | 1024 | 512 | 256;

/**
 * Embedding result for a single input from the VoyageAI API.
 */
export type EmbeddingResult = {
  /** The object type, always "embedding". */
  object: string;
  /** The embedding vector as an array of numbers. */
  embedding: number[];
  /** Index of the input in the original request array. */
  index: number;
};

/**
 * Full response from VoyageAI embeddings API.
 *
 * @description Matches the exact structure returned by the API.
 * @see https://docs.voyageai.com/reference/embeddings-api
 */
export type VoyageResponse = {
  /** The object type, always "list". */
  object: string;
  /** Array of embedding results. */
  data: EmbeddingResult[];
  /** Name of the model used. */
  model: string;
  /** Token usage information. */
  usage: {
    /** Total number of tokens processed. */
    total_tokens: number;
  };
};

/**
 * Options for generating embeddings.
 *
 * @description Advanced configuration options for the VoyageAI embeddings API.
 */
export type GenerateEmbeddingsOptions = {
  /**
   * Whether inputs are queries, documents, or neither.
   *
   * @description
   * - `null`: Direct embedding without prompt prefix (default for general use).
   * - `"query"`: For search queries - prepends retrieval prompt.
   * - `"document"`: For documents to be searched - prepends document prompt.
   *
   * @default "document"
   */
  inputType?: EmbeddingInputType;

  /**
   * The embedding model to use.
   *
   * @default VOYAGE_MODELS.VOYAGE_3_LARGE
   */
  model?: string;

  /**
   * Whether to truncate inputs that exceed the context length.
   *
   * @description
   * - `true`: Truncate over-length inputs before embedding (default).
   * - `false`: Raise an error if any input exceeds context length.
   *
   * @default true
   */
  truncation?: boolean;

  /**
   * Output embedding dimension.
   *
   * @description Only supported by voyage-3-large, voyage-3.5, voyage-3.5-lite,
   * and voyage-code-3. Other models use fixed dimensions.
   *
   * Supported values: 2048, 1024 (default), 512, 256.
   *
   * @default undefined (uses model default, typically 1024)
   */
  outputDimension?: EmbeddingOutputDimension;

  /**
   * Output data type for embeddings.
   *
   * @description
   * - `"float"`: 32-bit floating point (default, highest precision).
   * - `"int8"`: 8-bit signed integers.
   * - `"uint8"`: 8-bit unsigned integers.
   * - `"binary"`: Bit-packed signed integers.
   * - `"ubinary"`: Bit-packed unsigned integers.
   *
   * Quantized types only supported by voyage-3-large, voyage-3.5,
   * voyage-3.5-lite, and voyage-code-3.
   *
   * @default "float"
   */
  outputDtype?: EmbeddingOutputDtype;
};

/**
 * Check if VoyageAI is configured.
 *
 * @description Checks if the VOYAGE_API_KEY environment variable is set.
 * This is required for making API calls to VoyageAI.
 *
 * @returns True if API key is set, false otherwise.
 *
 * @example
 * ```typescript
 * if (isVoyageConfigured()) {
 *   const embeddings = await generateEmbeddings(texts);
 * } else {
 *   // Fall back to alternative method
 * }
 * ```
 */
export function isVoyageConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

/**
 * Maximum number of texts per API request.
 *
 * @description The VoyageAI API accepts up to 1000 texts per request.
 * The total tokens across all texts must also be within model limits:
 * - 1M tokens for voyage-3.5-lite
 * - 320K tokens for voyage-3.5 and voyage-2
 * - 120K tokens for voyage-3-large, voyage-code-3, voyage-finance-2, voyage-law-2
 *
 * @see https://docs.voyageai.com/reference/embeddings-api
 */
const MAX_BATCH_SIZE = 1000;

/**
 * Generate embeddings using VoyageAI.
 *
 * @description Creates vector embeddings for the given texts using the VoyageAI API.
 * Automatically batches requests if the input exceeds the maximum batch size.
 *
 * @param texts - Array of texts to embed. Maximum 1000 per batch.
 * @param options - Optional configuration for the embedding request.
 * @returns Array of embedding vectors in the same order as input texts.
 *
 * @throws {Error} If VOYAGE_API_KEY is not set.
 * @throws {Error} If the API call fails (4XX or 5XX response).
 *
 * @example
 * ```typescript
 * // Basic usage - embed documents for storage
 * const docEmbeddings = await generateEmbeddings(
 *   ["Tool A does X", "Tool B does Y"],
 *   { inputType: "document" }
 * );
 *
 * // Embed query for search
 * const queryEmbedding = await generateEmbeddings(
 *   ["find a tool for X"],
 *   { inputType: "query" }
 * );
 *
 * // Advanced: Use smaller dimensions for efficiency
 * const compactEmbeddings = await generateEmbeddings(
 *   texts,
 *   {
 *     inputType: "document",
 *     model: VOYAGE_MODELS.VOYAGE_3_5,
 *     outputDimension: 512,
 *   }
 * );
 * ```
 *
 * @see https://docs.voyageai.com/reference/embeddings-api
 */
export async function generateEmbeddings(
  texts: string[],
  options: GenerateEmbeddingsOptions = {}
): Promise<number[][]> {
  const {
    inputType = "document",
    model = DEFAULT_VOYAGE_MODEL,
    truncation,
    outputDimension,
    outputDtype,
  } = options;

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

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    // Build request body with only defined parameters
    const requestBody: Record<string, unknown> = {
      model,
      input: batch,
    };

    // Only include input_type if specified (API defaults to null)
    if (inputType !== null) {
      requestBody.input_type = inputType;
    }

    // Include optional parameters only if explicitly set
    if (truncation !== undefined) {
      requestBody.truncation = truncation;
    }
    if (outputDimension !== undefined) {
      requestBody.output_dimension = outputDimension;
    }
    if (outputDtype !== undefined) {
      requestBody.output_dtype = outputDtype;
    }

    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `VoyageAI API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data: VoyageResponse = await response.json();

    // Sort by index to ensure correct ordering and extract embeddings
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
 * Wraps generateEmbeddings for single-text use cases.
 *
 * @param text - The text to embed.
 * @param options - Optional configuration for the embedding request.
 * @returns The embedding vector.
 *
 * @throws {Error} If VOYAGE_API_KEY is not set.
 * @throws {Error} If the API call fails.
 *
 * @example
 * ```typescript
 * // Embed a search query
 * const queryVector = await generateEmbedding(
 *   "How do I authenticate users?",
 *   { inputType: "query" }
 * );
 *
 * // Embed a document
 * const docVector = await generateEmbedding(
 *   "This tool provides authentication services...",
 *   { inputType: "document" }
 * );
 * ```
 */
export async function generateEmbedding(
  text: string,
  options: GenerateEmbeddingsOptions = {}
): Promise<number[]> {
  const embeddings = await generateEmbeddings([text], options);
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
