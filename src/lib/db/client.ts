import { MongoClient, Db, ServerApiVersion } from "mongodb";

/**
 * MongoDB connection configuration.
 *
 * @description Manages the MongoDB client connection with connection pooling
 * and caching for serverless environments like Vercel.
 *
 * @see https://www.mongodb.com/docs/drivers/node/current/fundamentals/connection/
 */

/**
 * Cached MongoDB client instance.
 * Prevents creating new connections on every request in development.
 */
let cachedClient: MongoClient | undefined;

/**
 * Cached database instance.
 */
let cachedDb: Db | undefined;

/**
 * MongoDB connection options.
 */
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  /**
   * Connection pool settings for serverless.
   */
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTimeMS: 30000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

/**
 * Global type augmentation for caching in development.
 */
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * Get or create the MongoDB client connection.
 *
 * @description Creates a single MongoDB client instance that is cached
 * across requests. In development, the client is stored on the global
 * object to prevent connection leaks during hot reloading.
 *
 * @returns Promise resolving to the MongoDB client.
 *
 * @example
 * ```typescript
 * const client = await getClient();
 * const collection = client.db("paigent").collection("runs");
 * ```
 */
async function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI environment variable is not defined. " +
        "Please add it to your .env.local file."
    );
  }

  if (process.env.NODE_ENV === "development") {
    // In development, use a global variable to preserve the client
    // across module reloads caused by HMR (Hot Module Replacement).
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }

  // In production, create a new client instance.
  if (cachedClient) {
    return cachedClient;
  }

  const client = new MongoClient(uri, options);
  cachedClient = await client.connect();
  return cachedClient;
}

/**
 * Get the Paigent database instance.
 *
 * @description Returns a cached database instance for the "paigent" database.
 * Creates the connection if it doesn't exist.
 *
 * @returns Promise resolving to the database instance.
 *
 * @example
 * ```typescript
 * const db = await getDb();
 * const runs = await db.collection("runs").find({}).toArray();
 * ```
 */
export async function getDb(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const client = await getClient();
  cachedDb = client.db("paigent");

  return cachedDb;
}

/**
 * Close the MongoDB connection.
 *
 * @description Closes the cached client connection. Should be called
 * during graceful shutdown. In development with HMR, this is typically
 * not needed.
 */
export async function closeConnection(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = undefined;
    cachedDb = undefined;
  }
}

/**
 * Check if the database connection is healthy.
 *
 * @description Performs a ping to verify the database is accessible.
 * Useful for health check endpoints.
 *
 * @returns True if connection is healthy, false otherwise.
 */
export async function isConnectionHealthy(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export { getClient };
