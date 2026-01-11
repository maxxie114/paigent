import { ObjectId } from "mongodb";
import { collections, WorkspaceDocument, WorkspaceMemberDocument, WorkspaceSettings } from "../collections";

/**
 * Workspace Query Helpers
 *
 * @description Database query functions for workspace operations.
 * All queries enforce workspace-level access control.
 */

/**
 * Default workspace settings.
 */
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  autoPayEnabled: false,
  autoPayMaxPerStepAtomic: "1000000", // 1 USDC
  autoPayMaxPerRunAtomic: "10000000", // 10 USDC
  toolAllowlist: [],
};

/**
 * Create a new workspace.
 *
 * @param params - Workspace creation parameters.
 * @returns The created workspace document.
 */
export async function createWorkspace(params: {
  name: string;
  ownerClerkUserId: string;
  settings?: Partial<WorkspaceSettings>;
}): Promise<WorkspaceDocument> {
  const { name, ownerClerkUserId, settings } = params;
  const workspaces = await collections.workspaces();
  const members = await collections.workspaceMembers();

  const now = new Date();
  const workspaceId = new ObjectId();

  const workspace: WorkspaceDocument = {
    _id: workspaceId,
    name,
    createdAt: now,
    settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...settings },
  };

  await workspaces.insertOne(workspace);

  // Add owner as first member
  const membership: WorkspaceMemberDocument = {
    _id: new ObjectId(),
    workspaceId,
    clerkUserId: ownerClerkUserId,
    role: "owner",
    createdAt: now,
  };

  await members.insertOne(membership);

  return workspace;
}

/**
 * Get a workspace by ID.
 *
 * @param workspaceId - The workspace ID.
 * @returns The workspace document or null if not found.
 */
export async function getWorkspace(
  workspaceId: ObjectId
): Promise<WorkspaceDocument | null> {
  const workspaces = await collections.workspaces();
  return workspaces.findOne({ _id: workspaceId });
}

/**
 * Get all workspaces for a user.
 *
 * @param clerkUserId - The Clerk user ID.
 * @returns Array of workspace documents the user belongs to.
 */
export async function getWorkspacesForUser(
  clerkUserId: string
): Promise<WorkspaceDocument[]> {
  const members = await collections.workspaceMembers();
  const workspaces = await collections.workspaces();

  // Get user's memberships
  const memberships = await members
    .find({ clerkUserId })
    .toArray();

  if (memberships.length === 0) {
    return [];
  }

  // Get corresponding workspaces
  const workspaceIds = memberships.map((m) => m.workspaceId);
  return workspaces
    .find({ _id: { $in: workspaceIds } })
    .toArray();
}

/**
 * Verify user membership in a workspace.
 *
 * @param clerkUserId - The Clerk user ID.
 * @param workspaceId - The workspace ID.
 * @returns The membership document or null if not a member.
 */
export async function verifyMembership(
  clerkUserId: string,
  workspaceId: ObjectId
): Promise<WorkspaceMemberDocument | null> {
  const members = await collections.workspaceMembers();
  return members.findOne({ clerkUserId, workspaceId });
}

/**
 * Update workspace settings.
 *
 * @param workspaceId - The workspace ID.
 * @param settings - Partial settings to update.
 * @returns True if updated, false if workspace not found.
 */
export async function updateWorkspaceSettings(
  workspaceId: ObjectId,
  settings: Partial<WorkspaceSettings>
): Promise<boolean> {
  const workspaces = await collections.workspaces();

  const result = await workspaces.updateOne(
    { _id: workspaceId },
    {
      $set: Object.fromEntries(
        Object.entries(settings).map(([key, value]) => [`settings.${key}`, value])
      ),
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Add a member to a workspace.
 *
 * @param params - Member addition parameters.
 * @returns The membership document.
 */
export async function addWorkspaceMember(params: {
  workspaceId: ObjectId;
  clerkUserId: string;
  role: "admin" | "member" | "viewer";
}): Promise<WorkspaceMemberDocument> {
  const { workspaceId, clerkUserId, role } = params;
  const members = await collections.workspaceMembers();

  const membership: WorkspaceMemberDocument = {
    _id: new ObjectId(),
    workspaceId,
    clerkUserId,
    role,
    createdAt: new Date(),
  };

  await members.insertOne(membership);
  return membership;
}

/**
 * Get a single workspace for a user.
 *
 * @description Returns the user's first workspace, or null if they have none.
 * Useful for APIs that need a default workspace context.
 *
 * @param clerkUserId - The Clerk user ID.
 * @returns The user's first workspace or null.
 */
export async function getWorkspaceForUser(
  clerkUserId: string
): Promise<WorkspaceDocument | null> {
  const workspaces = await getWorkspacesForUser(clerkUserId);
  return workspaces.length > 0 ? workspaces[0] : null;
}

/**
 * Get or create a default workspace for a user.
 *
 * @description Creates a personal workspace if the user has no workspaces.
 *
 * @param clerkUserId - The Clerk user ID.
 * @param userName - The user's display name for workspace naming.
 * @returns The user's first workspace.
 */
export async function getOrCreateDefaultWorkspace(
  clerkUserId: string,
  userName?: string
): Promise<WorkspaceDocument> {
  const existingWorkspaces = await getWorkspacesForUser(clerkUserId);

  if (existingWorkspaces.length > 0) {
    return existingWorkspaces[0];
  }

  // Create a default personal workspace
  const name = userName ? `${userName}'s Workspace` : "My Workspace";
  return createWorkspace({
    name,
    ownerClerkUserId: clerkUserId,
  });
}
