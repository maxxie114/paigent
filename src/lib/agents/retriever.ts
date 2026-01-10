/**
 * Retriever Agent
 *
 * @description Discovers and retrieves relevant tools using vector search.
 * Implements adaptive retrieval with query refinement.
 *
 * @see paigent-studio-spec.md Section 13
 */

import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/client";
import { collections, ToolDocument } from "@/lib/db/collections";
import { generateEmbedding, isVoyageConfigured } from "@/lib/voyage/embeddings";
import { callLLM, FIREWORKS_MODELS } from "@/lib/fireworks/client";
import { extractJsonWithRepair } from "@/lib/utils/json-parser";

/**
 * Tool search result.
 */
export type ToolSearchResult = {
  /** The tool document. */
  tool: ToolDocument;
  /** Relevance score (0-1). */
  score: number;
  /** Reason this tool matched. */
  matchReason?: string;
};

/**
 * Retrieval critique from the LLM.
 */
export type RetrievalCritique = {
  /** Whether results are sufficient. */
  sufficient: boolean;
  /** Coverage assessment. */
  coverage: string;
  /** Diversity assessment. */
  diversity: string;
  /** Refined query for next iteration. */
  refinedQuery: string;
  /** Capabilities that are missing. */
  missingCapabilities: string[];
};

/**
 * Discover tools matching a query.
 *
 * @description Performs vector search using VoyageAI embeddings and Atlas Vector Search.
 *
 * @param params - Search parameters.
 * @returns Array of matching tools with scores.
 */
export async function discoverTools(params: {
  query: string;
  workspaceId: ObjectId;
  maxResults?: number;
}): Promise<ToolSearchResult[]> {
  const { query, workspaceId, maxResults = 10 } = params;

  // Check if VoyageAI is configured
  if (!isVoyageConfigured()) {
    // Fall back to text search
    return fallbackTextSearch(query, workspaceId, maxResults);
  }

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query, "query");

    const db = await getDb();

    // Perform vector search
    const results = await db
      .collection("tools")
      .aggregate([
        {
          $vectorSearch: {
            index: "tool_vector_index",
            path: "embedding",
            queryVector: queryEmbedding,
            numCandidates: maxResults * 10,
            limit: maxResults,
            filter: { workspaceId },
          },
        },
        {
          $project: {
            _id: 1,
            workspaceId: 1,
            source: 1,
            name: 1,
            description: 1,
            baseUrl: 1,
            endpoints: 1,
            reputation: 1,
            pricingHints: 1,
            createdAt: 1,
            updatedAt: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();

    return results.map((result) => ({
      tool: result as unknown as ToolDocument,
      score: result.score as number,
    }));
  } catch (error) {
    console.error("Vector search error:", error);
    // Fall back to text search
    return fallbackTextSearch(query, workspaceId, maxResults);
  }
}

/**
 * Fallback text search when vector search is unavailable.
 */
async function fallbackTextSearch(
  query: string,
  workspaceId: ObjectId,
  maxResults: number
): Promise<ToolSearchResult[]> {
  const toolsCollection = await collections.tools();

  // Simple text search using regex
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);

  const tools = await toolsCollection
    .find({
      workspaceId,
      $or: [
        { name: { $regex: queryWords.join("|"), $options: "i" } },
        { description: { $regex: queryWords.join("|"), $options: "i" } },
      ],
    })
    .limit(maxResults)
    .toArray();

  // Score based on word matches
  return tools.map((tool) => {
    const text = `${tool.name} ${tool.description}`.toLowerCase();
    const matchCount = queryWords.filter((word) => text.includes(word)).length;
    const score = matchCount / queryWords.length;

    return { tool, score };
  });
}

/**
 * Critique retrieval results using LLM.
 *
 * @description Analyzes whether the retrieved tools are sufficient
 * and suggests query refinements if needed.
 */
async function critiqueToolResults(params: {
  intent: string;
  tools: ToolSearchResult[];
  iteration: number;
}): Promise<RetrievalCritique> {
  const { intent, tools, iteration } = params;

  try {
    const response = await callLLM({
      systemPrompt: `You are a tool retrieval critic. Analyze whether the retrieved tools are sufficient for the user's intent.

Output JSON:
{
  "sufficient": boolean,
  "coverage": "assessment of how well tools cover the need",
  "diversity": "assessment of tool variety",
  "refinedQuery": "improved search query if not sufficient",
  "missingCapabilities": ["capability 1", "capability 2"]
}`,
      userPrompt: `
Intent: "${intent}"
Iteration: ${iteration + 1}

Retrieved tools (${tools.length}):
${tools.map((t) => `- ${t.tool.name} (score: ${t.score.toFixed(2)}): ${t.tool.description}`).join("\n")}

Are these tools sufficient? If not, how should the query be refined?`,
      model: FIREWORKS_MODELS.GLM_4_9B,
      maxTokens: 512,
      temperature: 0.5,
    });

    const extracted = extractJsonWithRepair(response.text);
    if (extracted && typeof extracted === "object") {
      return extracted as RetrievalCritique;
    }
  } catch (error) {
    console.error("Critique error:", error);
  }

  // Fallback critique
  return {
    sufficient: tools.length >= 3 && tools[0]?.score > 0.5,
    coverage: tools.length > 0 ? "Some coverage" : "No tools found",
    diversity: "Unknown",
    refinedQuery: intent,
    missingCapabilities: [],
  };
}

/**
 * Adaptive retrieval loop.
 *
 * @description Iteratively searches for tools, critiques results,
 * and refines the query until sufficient tools are found.
 *
 * @param params - Retrieval parameters.
 * @returns Array of relevant tools.
 *
 * @example
 * ```typescript
 * const tools = await adaptiveRetrievalLoop({
 *   intent: "summarize news articles",
 *   workspaceId: new ObjectId(),
 * });
 * ```
 */
export async function adaptiveRetrievalLoop(params: {
  intent: string;
  workspaceId: ObjectId;
  maxIterations?: number;
  minResults?: number;
}): Promise<ToolDocument[]> {
  const { intent, workspaceId, maxIterations = 3, minResults = 1 } = params;

  let query = intent;
  const allResults: Map<string, ToolSearchResult> = new Map();

  for (let i = 0; i < maxIterations; i++) {
    // Search with current query
    const results = await discoverTools({ query, workspaceId });

    // Merge results (keep highest score for duplicates)
    for (const result of results) {
      const key = result.tool._id.toString();
      const existing = allResults.get(key);
      if (!existing || result.score > existing.score) {
        allResults.set(key, result);
      }
    }

    // Check if we have enough results
    if (allResults.size >= minResults) {
      // Critique results
      const critique = await critiqueToolResults({
        intent,
        tools: Array.from(allResults.values()),
        iteration: i,
      });

      if (critique.sufficient) {
        break;
      }

      // Refine query for next iteration
      query = critique.refinedQuery || query;
    }
  }

  // Sort by score and return tools
  const sortedResults = Array.from(allResults.values()).sort(
    (a, b) => b.score - a.score
  );

  return sortedResults.map((r) => r.tool);
}
