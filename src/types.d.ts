/**
 * TypeScript type definitions for isomorphic-jj
 *
 * This file provides type safety for the isomorphic-jj API.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Unique identifier for a change (stable across rewrites)
 */
export type ChangeID = string;

/**
 * Git commit hash (mutable, changes on rewrite)
 */
export type CommitID = string;

/**
 * Unique identifier for an operation in the operation log
 */
export type OperationID = string;

/**
 * Git tree hash reference
 */
export type TreeRef = string;

/**
 * Revset expression for querying changes
 */
export type Revset = string;

// ============================================================================
// User and Author Types
// ============================================================================

/**
 * User information for commits and operations
 */
export interface User {
  name: string;
  email: string;
}

/**
 * Author information with timestamp
 */
export interface Author extends User {
  timestamp: Date;
}

/**
 * User information for operation log
 */
export interface OperationUser extends User {
  hostname: string;
}

// ============================================================================
// Change and Commit Types
// ============================================================================

/**
 * A change in the repository
 */
export interface Change {
  changeId: ChangeID;
  commitId: CommitID;
  parents: ChangeID[];
  tree: TreeRef;
  author: Author;
  committer: Author;
  description: string;
  timestamp: Date;
  fileSnapshot?: Record<string, FileSnapshot>;
}

/**
 * File snapshot data for undo operations
 */
export interface FileSnapshot {
  content: Uint8Array | string;
  mode: number;
}

/**
 * Log entry with additional metadata
 */
export interface LogEntry {
  change: Change;
  children: ChangeID[];
  bookmarks: string[];
  remoteBookmarks: Map<string, string[]>;
  isWorkingCopy: boolean;
  hasConflicts: boolean;
}

// ============================================================================
// Operation Log Types
// ============================================================================

/**
 * An operation in the operation log
 */
export interface Operation {
  id: OperationID;
  timestamp: Date;
  user: OperationUser;
  description: string;
  parents: OperationID[];
  view: View;
  fileSnapshot?: Record<string, FileSnapshot>;
}

/**
 * Repository view at a specific operation
 */
export interface View {
  bookmarks: Map<string, ChangeID>;
  remoteBookmarks: Map<string, Map<string, ChangeID>>;
  heads: Set<ChangeID>;
  workingCopy: ChangeID;
}

// ============================================================================
// Bookmark Types
// ============================================================================

/**
 * A bookmark (named pointer to a change)
 */
export interface Bookmark {
  name: string;
  target: ChangeID;
  remote?: string;
}

// ============================================================================
// Conflict Types
// ============================================================================

/**
 * Types of conflicts
 */
export type ConflictType = 'content' | 'add-add' | 'delete-modify' | 'modify-delete';

/**
 * A conflict in the repository
 */
export interface Conflict {
  conflictId: string;
  path: string;
  type: ConflictType;
  base?: TreeRef;
  sides: TreeRef[];
  resolved: boolean;
}

/**
 * Conflict resolution
 */
export type ConflictResolution =
  | { side: 'ours' | 'theirs' | 'base' }
  | { content: Uint8Array | string };

// ============================================================================
// Workspace Types
// ============================================================================

/**
 * A workspace (working copy)
 */
export interface Workspace {
  id: string;
  path: string;
  name: string;
  changeId: ChangeID;
  active: boolean;
}

// ============================================================================
// File Operation Types
// ============================================================================

/**
 * File metadata
 */
export interface FileInfo {
  path: string;
  size: number;
  mode: number;
  mtime: number;
  type: 'file' | 'symlink' | 'directory';
}

/**
 * Working copy status
 */
export interface Status {
  workingCopy: Change;
  modified: string[];
  added: string[];
  removed: string[];
  conflicts: string[];
}

/**
 * Repository statistics
 */
export interface RepositoryStats {
  changes: {
    total: number;
    mine: number;
    merges: number;
    empty: number;
  };
  files: {
    total: number;
    modified: number;
    added: number;
    removed: number;
  };
  authors: {
    total: number;
    list: Array<{ name: string; email: string; count: number }>;
  };
  bookmarks: {
    local: number;
    remote: number;
  };
}

// ============================================================================
// Configuration and Options Types
// ============================================================================

/**
 * Filesystem interface (Node fs or LightningFS compatible)
 */
export interface FileSystem {
  promises: {
    readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
    writeFile(path: string, data: string | Uint8Array): Promise<void>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<{ size: number; mtime: Date; isDirectory(): boolean }>;
    unlink(path: string): Promise<void>;
    rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  };
}

/**
 * HTTP client interface for network operations
 */
export interface HttpClient {
  (args: any): Promise<any>;
}

/**
 * Event hook context
 */
export interface HookContext {
  operation: string;
  changeId?: ChangeID;
  change?: Change;
  user?: User;
}

/**
 * Event hooks configuration
 */
export interface Hooks {
  preCommit?: (context: HookContext) => Promise<void>;
  postCommit?: (context: HookContext) => Promise<void>;
}

/**
 * JJ repository creation options
 */
export interface CreateJJOptions {
  /** Filesystem implementation (Node fs, LightningFS, etc.) */
  fs: FileSystem;
  /** Repository directory path */
  dir: string;
  /** isomorphic-git instance (enables Git backend) */
  git?: any;
  /** HTTP client for network operations */
  http?: HttpClient;
  /** Backend name or instance */
  backend?: string | any;
  /** Event hooks */
  hooks?: Hooks;
}

/**
 * Repository initialization options
 */
export interface InitOptions {
  userName?: string;
  userEmail?: string;
  colocate?: boolean;
  defaultRemote?: string;
}

/**
 * Write file arguments
 */
export interface WriteArgs {
  path: string;
  data: Uint8Array | string;
}

/**
 * Read file arguments
 */
export interface ReadArgs {
  path: string;
  changeId?: ChangeID;
  encoding?: 'utf-8' | 'binary';
}

/**
 * Move file arguments
 */
export interface MoveFileArgs {
  from: string;
  to: string;
}

/**
 * Remove file arguments
 */
export interface RemoveArgs {
  path: string;
}

/**
 * List files arguments
 */
export interface ListFilesArgs {
  changeId?: ChangeID;
}

/**
 * Read stream arguments (Node.js only)
 */
export interface ReadStreamArgs {
  path: string;
  changeId?: ChangeID;
  encoding?: string;
}

/**
 * Write stream arguments (Node.js only)
 */
export interface WriteStreamArgs {
  path: string;
  encoding?: string;
}

/**
 * Describe change arguments
 */
export interface DescribeArgs {
  message?: string;
  author?: User;
}

/**
 * Create new change arguments
 */
export interface NewArgs {
  message?: string;
  parents?: ChangeID | ChangeID[];
  from?: Revset;
  insertAfter?: ChangeID;
  insertBefore?: ChangeID;
}

/**
 * Amend change arguments
 */
export interface AmendArgs {
  message?: string;
}

/**
 * Commit change arguments (describe + new)
 */
export interface CommitArgs {
  message?: string;
  author?: User;
  nextMessage?: string;
}

/**
 * Edit change arguments
 */
export interface EditArgs {
  changeId: Revset;
}

/**
 * Squash changes arguments
 */
export interface SquashArgs {
  source?: ChangeID;
  dest?: ChangeID;
  into?: ChangeID;
}

/**
 * Split change arguments
 */
export interface SplitArgs {
  changeId: ChangeID;
  description1: string;
  description2: string;
  paths?: string[];
}

/**
 * Move change arguments
 */
export interface MoveChangeArgs {
  from: Revset;
  to: Revset;
  paths?: string[];
}

/**
 * Abandon change arguments
 */
export interface AbandonArgs {
  changeId?: ChangeID;
}

/**
 * Un-abandon change arguments
 */
export interface UnabandonArgs {
  changeId: ChangeID;
}

/**
 * Log query options
 */
export interface LogOptions {
  revset?: Revset;
  limit?: number;
}

/**
 * Show change arguments
 */
export interface ShowArgs {
  change: Revset;
}

/**
 * Obslog options
 */
export interface ObslogOptions {
  change?: Revset;
  limit?: number;
}

/**
 * Undo options
 */
export interface UndoOptions {
  count?: number;
}

/**
 * Resolve conflict arguments
 */
export interface ResolveConflictArgs {
  change: Revset;
  path: string;
  resolution: ConflictResolution;
}

/**
 * Merge arguments
 */
export interface MergeArgs {
  source: Revset;
  dest?: Revset;
  message?: string;
}

/**
 * Bookmark set arguments
 */
export interface BookmarkSetArgs {
  name: string;
  target: Revset;
}

/**
 * Bookmark move arguments
 */
export interface BookmarkMoveArgs {
  name: string;
  target: Revset;
}

/**
 * Bookmark delete arguments
 */
export interface BookmarkDeleteArgs {
  name: string;
}

/**
 * Remote add arguments
 */
export interface RemoteAddArgs {
  name: string;
  url: string;
}

/**
 * Remote fetch arguments
 */
export interface RemoteFetchArgs {
  remote?: string;
  refs?: string[];
  depth?: number;
  singleBranch?: boolean;
  noTags?: boolean;
  relative?: boolean;
}

/**
 * Remote push arguments
 */
export interface RemotePushArgs {
  remote?: string;
  refs?: string[];
  force?: boolean;
}

/**
 * Git export arguments
 */
export interface GitExportArgs {
  bookmark?: string;
}

/**
 * Workspace add arguments
 */
export interface WorkspaceAddArgs {
  path: string;
  name: string;
  changeId?: ChangeID;
}

/**
 * Workspace remove arguments
 */
export interface WorkspaceRemoveArgs {
  id: string;
}

/**
 * Background operation options
 */
export interface BackgroundOptions {
  debounceMs?: number;
}

// ============================================================================
// Return Types
// ============================================================================

/**
 * Write operation result
 */
export interface WriteResult extends FileInfo {}

/**
 * Move operation result
 */
export interface MoveResult {
  from: string;
  to: string;
}

/**
 * Remove operation result
 */
export interface RemoveResult extends FileInfo {}

/**
 * Undo operation result
 */
export interface UndoResult {
  undoneOperation: {
    description: string;
    timestamp: Date;
  };
  restoredState: {
    workingCopy: ChangeID;
    filesRestored: number;
  };
}

/**
 * Split operation result
 */
export interface SplitResult {
  original: Change;
  new: Change;
}

/**
 * Merge operation result
 */
export interface MergeResult {
  merged: boolean;
  conflicts: Conflict[];
}

// ============================================================================
// Main JJ Repository Interface
// ============================================================================

/**
 * Main JJ repository instance
 */
export interface JJ {
  // Core components (exposed for advanced usage)
  graph: any;
  workingCopy: any;
  oplog: any;
  bookmarks: any;
  conflicts: any;
  workspaces: any;
  userConfig: any;
  revset: any;
  gitBackend?: any;
  backgroundOps?: any;

  // Repository lifecycle
  init(opts?: InitOptions): Promise<void>;

  // File operations
  write(args: WriteArgs): Promise<WriteResult>;
  read(args: ReadArgs): Promise<string | Uint8Array>;
  cat(args: ReadArgs): Promise<string | Uint8Array>;
  move(args: MoveFileArgs): Promise<MoveResult>;
  remove(args: RemoveArgs): Promise<RemoveResult>;
  listFiles(args?: ListFilesArgs): Promise<string[]>;
  readStream(args: ReadStreamArgs): Promise<any>;
  writeStream(args: WriteStreamArgs): Promise<any>;

  // Change operations
  describe(args?: DescribeArgs): Promise<Change>;
  new(args?: NewArgs): Promise<Change>;
  amend(args?: AmendArgs): Promise<Change>;
  commit(args?: CommitArgs): Promise<Change>;
  edit(args: EditArgs): Promise<void>;
  status(): Promise<Status>;
  stats(): Promise<RepositoryStats>;

  // History editing
  squash(args: SquashArgs): Promise<void>;
  split(args: SplitArgs): Promise<SplitResult>;
  abandon(args: AbandonArgs): Promise<void>;
  unabandon(args: UnabandonArgs): Promise<void>;

  // Queries
  log(opts?: LogOptions): Promise<LogEntry[]>;
  show(args: ShowArgs): Promise<Change>;
  obslog(opts?: ObslogOptions): Promise<Operation[]>;

  // Operations
  undo(opts?: UndoOptions): Promise<UndoResult>;
  operations: {
    list(opts?: { limit?: number }): Promise<Operation[]>;
    at(args: { operation: OperationID }): Promise<JJ>;
  };

  // Conflicts
  merge(args: MergeArgs): Promise<MergeResult>;

  // Bookmarks
  bookmark: {
    list(): Promise<Bookmark[]>;
    set(args: BookmarkSetArgs): Promise<void>;
    move(args: BookmarkMoveArgs): Promise<void>;
    delete(args: BookmarkDeleteArgs): Promise<void>;
  };

  // Git operations (only available with Git backend)
  git?: {
    init(opts?: InitOptions): Promise<void>;
    fetch(args?: RemoteFetchArgs): Promise<void>;
    push(args?: RemotePushArgs): Promise<void>;
    import(): Promise<void>;
    export(args?: GitExportArgs): Promise<void>;
  };

  // Remote operations
  remote: {
    add(args: RemoteAddArgs): Promise<void>;
    fetch(args?: RemoteFetchArgs): Promise<void>;
    push(args?: RemotePushArgs): Promise<void>;
  };

  // Workspaces
  workspace: {
    add(args: WorkspaceAddArgs): Promise<Workspace>;
    list(): Promise<Workspace[]>;
    remove(args: WorkspaceRemoveArgs): Promise<void>;
    get(args: { id: string }): Promise<Workspace | null>;
  };

  // Background operations (only available in Node.js)
  background?: {
    start(): Promise<{ started: boolean }>;
    stop(): Promise<{ stopped: boolean }>;
    enableAutoSnapshot(opts?: BackgroundOptions): Promise<void>;
    disableAutoSnapshot(): Promise<void>;
    queue<T>(fn: () => Promise<T>): Promise<{ promise: Promise<T>; id: string }>;
    watch(path: string, callback: (event: string, filename: string) => void): Promise<string>;
    unwatch(id: string): Promise<void>;
  };
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Create and initialize a JJ repository instance
 *
 * @param options - Configuration options
 * @returns Initialized JJ repository instance
 */
export function createJJ(options: CreateJJOptions): Promise<JJ>;

/**
 * JJ error class
 */
export class JJError extends Error {
  code: string;
  suggestion?: string;

  constructor(code: string, message: string, details?: { suggestion?: string });
}
