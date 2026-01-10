import { ObjectId } from "mongodb";
import {
  collections,
  RunEventDocument,
  RunEventType,
  EventActor,
} from "../collections";

/**
 * Run Event Query Helpers
 *
 * @description Database query functions for the append-only event log.
 * Events are never modified or deleted (audit trail).
 */

/**
 * Append a new event to the run log.
 *
 * @param params - Event parameters.
 * @returns The created event document.
 */
export async function appendRunEvent(params: {
  workspaceId: ObjectId;
  runId: ObjectId;
  type: RunEventType;
  data: Record<string, unknown>;
  actor: EventActor;
}): Promise<RunEventDocument> {
  const { workspaceId, runId, type, data, actor } = params;
  const events = await collections.runEvents();

  const event: RunEventDocument = {
    _id: new ObjectId(),
    workspaceId,
    runId,
    type,
    ts: new Date(),
    data,
    actor,
  };

  await events.insertOne(event);
  return event;
}

/**
 * Get events for a run.
 *
 * @param runId - The run ID.
 * @param options - Query options.
 * @returns Array of event documents, sorted by timestamp.
 */
export async function getEventsForRun(
  runId: ObjectId,
  options?: {
    types?: RunEventType[];
    since?: Date;
    limit?: number;
  }
): Promise<RunEventDocument[]> {
  const events = await collections.runEvents();

  const filter: Record<string, unknown> = { runId };

  if (options?.types?.length) {
    filter.type = { $in: options.types };
  }

  if (options?.since) {
    filter.ts = { $gt: options.since };
  }

  let cursor = events.find(filter).sort({ ts: 1 });

  if (options?.limit) {
    cursor = cursor.limit(options.limit);
  }

  return cursor.toArray();
}

/**
 * Get the latest event for a run.
 *
 * @param runId - The run ID.
 * @param type - Optional event type filter.
 * @returns The latest event or null.
 */
export async function getLatestEvent(
  runId: ObjectId,
  type?: RunEventType
): Promise<RunEventDocument | null> {
  const events = await collections.runEvents();

  const filter: Record<string, unknown> = { runId };
  if (type) {
    filter.type = type;
  }

  return events.findOne(filter, { sort: { ts: -1 } });
}

/**
 * Get events for a specific step.
 *
 * @param runId - The run ID.
 * @param stepId - The step ID.
 * @returns Array of events related to the step.
 */
export async function getEventsForStep(
  runId: ObjectId,
  stepId: string
): Promise<RunEventDocument[]> {
  const events = await collections.runEvents();

  return events
    .find({
      runId,
      "data.stepId": stepId,
    })
    .sort({ ts: 1 })
    .toArray();
}

/**
 * Count events by type for a run.
 *
 * @param runId - The run ID.
 * @returns Object with counts by event type.
 */
export async function countEventsByType(
  runId: ObjectId
): Promise<Record<string, number>> {
  const events = await collections.runEvents();

  const pipeline = [
    { $match: { runId } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ];

  const results = await events.aggregate(pipeline).toArray();

  const counts: Record<string, number> = {};
  for (const result of results) {
    counts[result._id as string] = result.count;
  }

  return counts;
}

/**
 * Get events since a timestamp (for SSE streaming).
 *
 * @param runId - The run ID.
 * @param since - Timestamp to get events after.
 * @returns Array of new events.
 */
export async function getEventsSince(
  runId: ObjectId,
  since: Date
): Promise<RunEventDocument[]> {
  const events = await collections.runEvents();

  return events
    .find({
      runId,
      ts: { $gt: since },
    })
    .sort({ ts: 1 })
    .toArray();
}
