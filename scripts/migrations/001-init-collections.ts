/**
 * Migration 001: Initialize Collections and Indexes
 *
 * @description Creates all required collections and indexes for the Paigent database.
 * This script should be run once during initial setup and idempotently on subsequent runs.
 *
 * Run with: npx tsx scripts/migrations/001-init-collections.ts
 *
 * @see paigent-studio-spec.md Section 7.2 for collection definitions
 */

import { MongoClient, ServerApiVersion, IndexSpecification, CreateIndexesOptions } from "mongodb";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const MIGRATION_VERSION = 1;
const MIGRATION_DESCRIPTION = "Initialize collections and indexes";

/**
 * Type definition for index configuration entries.
 */
type IndexDefinition = {
  key: IndexSpecification;
  options: CreateIndexesOptions & { name: string };
};

/**
 * Index definitions for each collection.
 */
const INDEX_DEFINITIONS: Record<string, IndexDefinition[]> = {
  workspaces: [],

  workspace_members: [
    {
      key: { workspaceId: 1, clerkUserId: 1 },
      options: { unique: true, name: "workspace_clerk_user_unique" },
    },
  ],

  tools: [
    {
      key: { workspaceId: 1, source: 1 },
      options: { name: "workspace_source" },
    },
    {
      key: { workspaceId: 1, baseUrl: 1 },
      options: { unique: true, name: "workspace_baseurl_unique" },
    },
  ],

  runs: [
    {
      key: { workspaceId: 1, status: 1 },
      options: { name: "workspace_status" },
    },
    {
      key: { workspaceId: 1, createdAt: -1 },
      options: { name: "workspace_created_desc" },
    },
  ],

  run_steps: [
    {
      key: { workspaceId: 1, runId: 1, status: 1 },
      options: { name: "workspace_run_status" },
    },
    {
      key: { runId: 1, stepId: 1 },
      options: { unique: true, name: "run_step_unique" },
    },
    {
      key: { status: 1, nextEligibleAt: 1 },
      options: { name: "status_eligible_for_claiming" },
    },
  ],

  run_events: [
    {
      key: { workspaceId: 1, runId: 1, ts: 1 },
      options: { name: "workspace_run_timestamp" },
    },
  ],

  payment_receipts: [
    {
      key: { workspaceId: 1, runId: 1 },
      options: { name: "workspace_run" },
    },
    {
      key: { runId: 1, stepId: 1 },
      options: { name: "run_step" },
    },
  ],

  step_artifacts: [
    {
      key: { runId: 1, stepId: 1 },
      options: { name: "run_step" },
    },
    {
      key: { createdAt: 1 },
      options: {
        name: "ttl_created",
        expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days TTL
      },
    },
  ],

  context_envelopes: [
    {
      key: { runId: 1, agent: 1 },
      options: { name: "run_agent" },
    },
  ],

  schema_migrations: [
    {
      key: { version: 1 },
      options: { unique: true, name: "version_unique" },
    },
  ],
};

/**
 * Run the migration.
 */
async function runMigration(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("Error: MONGODB_URI environment variable is not set.");
    console.error("Please create a .env.local file with your MongoDB connection string.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  try {
    await client.connect();
    console.log("Connected successfully.\n");

    const db = client.db("paigent");

    // Check if migration has already been applied
    const migrationsCollection = db.collection("schema_migrations");
    const existingMigration = await migrationsCollection.findOne({
      version: MIGRATION_VERSION,
    });

    if (existingMigration) {
      console.log(`Migration ${MIGRATION_VERSION} has already been applied.`);
      console.log(`Applied at: ${existingMigration.appliedAt}`);
      return;
    }

    console.log(`Running migration ${MIGRATION_VERSION}: ${MIGRATION_DESCRIPTION}\n`);

    // Create collections and indexes
    for (const [collectionName, indexes] of Object.entries(INDEX_DEFINITIONS)) {
      console.log(`Processing collection: ${collectionName}`);

      // Ensure collection exists
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        await db.createCollection(collectionName);
        console.log(`  Created collection: ${collectionName}`);
      } else {
        console.log(`  Collection exists: ${collectionName}`);
      }

      // Create indexes
      const collection = db.collection(collectionName);
      for (const indexDef of indexes) {
        try {
          await collection.createIndex(indexDef.key, indexDef.options);
          console.log(`  Created index: ${indexDef.options.name}`);
        } catch (error) {
          if (error instanceof Error && error.message.includes("already exists")) {
            console.log(`  Index exists: ${indexDef.options.name}`);
          } else {
            throw error;
          }
        }
      }

      console.log("");
    }

    // Record migration
    await migrationsCollection.insertOne({
      version: MIGRATION_VERSION,
      description: MIGRATION_DESCRIPTION,
      appliedAt: new Date(),
    });

    console.log(`Migration ${MIGRATION_VERSION} completed successfully.`);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\nConnection closed.");
  }
}

// Run the migration
runMigration().catch(console.error);
