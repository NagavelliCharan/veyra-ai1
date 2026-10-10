import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns';
import { MongoClient, type Db, type Collection } from 'mongodb';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore fallback failure
}

export interface FolderRecord {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  relativePath: string;
  createdAt: number;
  updatedAt: number;
  isFolder: true;
}

export interface FileRecord {
  id: string;
  projectId: string;
  name: string;
  folderId: string | null;
  relativePath: string;
  size: number;
  type: string;
  storageFilename: string;
  storagePath: string;
  createdAt: number;
  updatedAt: number;
  uploadedAt: number;
  textPreview?: string;
  isFolder: false;
}

interface MetadataState {
  folders: FolderRecord[];
  files: FileRecord[];
}

export class StorageManager {
  private uploadsDir: string;
  private metadataFile: string;
  private mongoClient: MongoClient | null = null;
  private mongoDb: Db | null = null;
  private filesCollection: Collection<FileRecord> | null = null;
  private foldersCollection: Collection<FolderRecord> | null = null;
  private isMongoConnected = false;
  private memoryState: MetadataState = { folders: [], files: [] };
  private initialized = false;

  constructor(customUploadsDir?: string) {
    const defaultDir = process.env.VERCEL
      ? path.join('/tmp', 'uploads')
      : path.resolve(process.cwd(), 'uploads');
    this.uploadsDir = customUploadsDir
      ? path.resolve(customUploadsDir)
      : process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : defaultDir;
    this.metadataFile = path.join(this.uploadsDir, 'metadata.json');
  }

  getUploadsDir(): string {
    return this.uploadsDir;
  }

  isDatabaseConnected(): boolean {
    return this.isMongoConnected;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // 1. Ensure uploads directory exists on disk outside build/temp folders
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }

    // 2. Load disk metadata fallback if exists
    if (fs.existsSync(this.metadataFile)) {
      try {
        const raw = fs.readFileSync(this.metadataFile, 'utf-8');
        this.memoryState = JSON.parse(raw);
        if (!Array.isArray(this.memoryState.folders)) this.memoryState.folders = [];
        if (!Array.isArray(this.memoryState.files)) this.memoryState.files = [];
      } catch (err) {
        console.warn('[Veyra Storage] Warning: Could not parse existing metadata.json, starting fresh.', err);
        this.memoryState = { folders: [], files: [] };
      }
    } else {
      this.saveDiskMetadata();
    }

    // 3. Attempt connection to MongoDB if configured
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/privy_ai';
    try {
      this.mongoClient = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000,
      });

      await this.mongoClient.connect();
      this.mongoDb = this.mongoClient.db(this.mongoClient.options.dbName || 'privy_ai');
      this.foldersCollection = this.mongoDb.collection<FolderRecord>('privy_folders');
      this.filesCollection = this.mongoDb.collection<FileRecord>('privy_files');
      this.isMongoConnected = true;

      // Create indexes for fast lookup
      await this.foldersCollection.createIndex({ projectId: 1, parentId: 1 });
      await this.filesCollection.createIndex({ projectId: 1, folderId: 1 });

      const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
      console.log(`[Veyra Storage] Successfully connected to MongoDB at ${sanitizedUri}`);

      // Sync existing disk records to MongoDB if MongoDB collection is empty
      const existingCount = await this.foldersCollection.countDocuments();
      if (existingCount === 0 && (this.memoryState.folders.length > 0 || this.memoryState.files.length > 0)) {
        if (this.memoryState.folders.length > 0) {
          await this.foldersCollection.insertMany(this.memoryState.folders);
        }
        if (this.memoryState.files.length > 0) {
          await this.filesCollection.insertMany(this.memoryState.files);
        }
      }
    } catch (err: any) {
      this.isMongoConnected = false;
      this.mongoClient = null;
      const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
      console.log(
        `[Veyra Storage] MongoDB is not running or unreachable at ${sanitizedUri}. Operating with persistent local disk storage (${this.uploadsDir}).`
      );
    }

    this.initialized = true;
  }

  private saveDiskMetadata(): void {
    try {
      fs.writeFileSync(this.metadataFile, JSON.stringify(this.memoryState, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Veyra Storage] Error writing metadata.json:', err);
    }
  }

  // --- Folder Management ---

  async createFolder(
    projectId: string,
    name: string,
    parentId: string | null = null
  ): Promise<FolderRecord> {
    await this.init();

    const sanitizedName = this.sanitizeName(name);
    if (!sanitizedName) {
      throw new Error('Folder name cannot be empty or invalid.');
    }

    // Verify parent folder exists if specified
    let relativePath = sanitizedName;
    if (parentId) {
      const parent = await this.getFolderById(parentId);
      if (!parent || parent.projectId !== projectId) {
        throw new Error(`Parent folder with ID "${parentId}" not found in this project.`);
      }
      relativePath = path.posix.join(parent.relativePath, sanitizedName);
    }

    // Check duplicate folder in same parent
    const siblings = await this.getFolders(projectId, parentId);
    const existing = siblings.find((f) => f.name.toLowerCase() === sanitizedName.toLowerCase());
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const folderId = `folder-${now}-${crypto.randomBytes(4).toString('hex')}`;

    const folderRecord: FolderRecord = {
      id: folderId,
      projectId,
      name: sanitizedName,
      parentId: parentId || null,
      relativePath,
      createdAt: now,
      updatedAt: now,
      isFolder: true,
    };

    if (this.isMongoConnected && this.foldersCollection) {
      await this.foldersCollection.insertOne({ ...folderRecord });
    }

    this.memoryState.folders.push(folderRecord);
    this.saveDiskMetadata();

    return folderRecord;
  }

  async getFolders(projectId: string, parentId?: string | null): Promise<FolderRecord[]> {
    await this.init();

    if (this.isMongoConnected && this.foldersCollection) {
      const query: any = { projectId };
      if (parentId !== undefined) {
        query.parentId = parentId;
      }
      const records = await this.foldersCollection.find(query).toArray();
      return records.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        name: r.name,
        parentId: r.parentId,
        relativePath: r.relativePath,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        isFolder: true,
      }));
    }

    return this.memoryState.folders.filter((f) => {
      if (f.projectId !== projectId) return false;
      if (parentId !== undefined) return f.parentId === parentId;
      return true;
    });
  }

  async getFolderById(id: string): Promise<FolderRecord | null> {
    await this.init();

    if (this.isMongoConnected && this.foldersCollection) {
      const doc = await this.foldersCollection.findOne({ id });
      if (!doc) return null;
      return {
        id: doc.id,
        projectId: doc.projectId,
        name: doc.name,
        parentId: doc.parentId,
        relativePath: doc.relativePath,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        isFolder: true,
      };
    }

    return this.memoryState.folders.find((f) => f.id === id) || null;
  }

  async deleteFolder(id: string): Promise<{ deletedFolders: string[]; deletedFiles: string[] }> {
    await this.init();

    const target = await this.getFolderById(id);
    if (!target) {
      throw new Error(`Folder with ID "${id}" not found.`);
    }

    // Recursively discover all descendants
    const allDescendantFolderIds: string[] = [id];
    const queue = [id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await this.getFolders(target.projectId, currentId);
      for (const child of children) {
        allDescendantFolderIds.push(child.id);
        queue.push(child.id);
      }
    }

    // Find all files in any of these folders
    const allProjectFiles = await this.getFiles(target.projectId);
    const filesToDelete = allProjectFiles.filter(
      (f) => f.folderId && allDescendantFolderIds.includes(f.folderId)
    );

    // Delete disk files
    for (const f of filesToDelete) {
      const fullPath = path.join(this.uploadsDir, f.storageFilename);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          console.warn(`Could not delete file ${fullPath}:`, e);
        }
      }
    }

    const deletedFileIds = filesToDelete.map((f) => f.id);

    // Remove from MongoDB
    if (this.isMongoConnected && this.foldersCollection && this.filesCollection) {
      await this.foldersCollection.deleteMany({ id: { $in: allDescendantFolderIds } });
      if (deletedFileIds.length > 0) {
        await this.filesCollection.deleteMany({ id: { $in: deletedFileIds } });
      }
    }

    // Remove from disk state
    this.memoryState.folders = this.memoryState.folders.filter(
      (f) => !allDescendantFolderIds.includes(f.id)
    );
    this.memoryState.files = this.memoryState.files.filter(
      (f) => !deletedFileIds.includes(f.id)
    );
    this.saveDiskMetadata();

    return {
      deletedFolders: allDescendantFolderIds,
      deletedFiles: deletedFileIds,
    };
  }

  // --- File Management ---

  async saveFile(params: {
    projectId: string;
    originalName: string;
    buffer: Buffer;
    mimeType?: string;
    folderId?: string | null;
    relativePath?: string;
  }): Promise<FileRecord> {
    await this.init();

    const { projectId, originalName, buffer, mimeType, folderId, relativePath } = params;

    const safeName = this.sanitizeName(originalName);
    if (!safeName) {
      throw new Error('File name cannot be empty or invalid.');
    }

    // Zero-byte files are explicitly allowed (buffer.length >= 0)
    const fileSize = buffer.length;

    // Auto-resolve folder hierarchy if relativePath contains directory components
    let resolvedFolderId = folderId || null;
    if (relativePath) {
      const normalizedRel = path.posix.normalize(relativePath).replace(/^\/+/, '');
      const dirPart = path.posix.dirname(normalizedRel);
      if (dirPart && dirPart !== '.') {
        const segments = dirPart.split('/').filter(Boolean);
        let curParent = resolvedFolderId;
        for (const seg of segments) {
          const folder = await this.createFolder(projectId, seg, curParent);
          curParent = folder.id;
        }
        resolvedFolderId = curParent;
      }
    }

    // Verify parent folder if provided
    let parentFolder: FolderRecord | null = null;
    if (resolvedFolderId) {
      parentFolder = await this.getFolderById(resolvedFolderId);
      if (!parentFolder || parentFolder.projectId !== projectId) {
        throw new Error(`Target folder with ID "${resolvedFolderId}" not found in this project.`);
      }
    }

    const now = Date.now();
    const fileId = `file-${now}-${crypto.randomBytes(4).toString('hex')}`;
    const ext = path.extname(safeName);
    const storageFilename = `${fileId}${ext ? ext : '.bin'}`;
    const storagePath = path.join(this.uploadsDir, storageFilename);

    // Verify no path traversal outside uploadsDir
    const resolvedPath = path.resolve(storagePath);
    if (!resolvedPath.startsWith(path.resolve(this.uploadsDir))) {
      throw new Error('Path traversal security violation detected.');
    }

    // Write file to disk (persistent storage)
    fs.writeFileSync(storagePath, buffer);

    const computedRelativePath = relativePath
      ? path.posix.normalize(relativePath)
      : parentFolder
      ? path.posix.join(parentFolder.relativePath, safeName)
      : safeName;

    let textSnippet: string | undefined = undefined;
    if (fileSize > 0 && fileSize < 500000) {
      if (
        safeName.endsWith('.txt') ||
        safeName.endsWith('.md') ||
        safeName.endsWith('.json') ||
        safeName.endsWith('.js') ||
        safeName.endsWith('.ts') ||
        (mimeType && (mimeType.startsWith('text/') || mimeType.includes('json')))
      ) {
        textSnippet = buffer.toString('utf-8');
      }
    }

    const fileRecord: FileRecord = {
      id: fileId,
      projectId,
      name: safeName,
      folderId: resolvedFolderId || null,
      relativePath: computedRelativePath,
      size: fileSize,
      type: mimeType || 'application/octet-stream',
      storageFilename,
      storagePath,
      createdAt: now,
      updatedAt: now,
      uploadedAt: now,
      textPreview: textSnippet,
      isFolder: false,
    };

    if (this.isMongoConnected && this.filesCollection) {
      await this.filesCollection.insertOne({ ...fileRecord });
    }

    this.memoryState.files.push(fileRecord);
    this.saveDiskMetadata();

    return fileRecord;
  }

  async getFiles(projectId: string, folderId?: string | null): Promise<FileRecord[]> {
    await this.init();

    if (this.isMongoConnected && this.filesCollection) {
      const query: any = { projectId };
      if (folderId !== undefined) {
        query.folderId = folderId;
      }
      const records = await this.filesCollection.find(query).toArray();
      return records.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        name: r.name,
        folderId: r.folderId,
        relativePath: r.relativePath,
        size: r.size,
        type: r.type,
        storageFilename: r.storageFilename,
        storagePath: r.storagePath,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        isFolder: false,
      }));
    }

    return this.memoryState.files.filter((f) => {
      if (f.projectId !== projectId) return false;
      if (folderId !== undefined) return f.folderId === folderId;
      return true;
    });
  }

  async getFileById(id: string): Promise<FileRecord | null> {
    await this.init();

    if (this.isMongoConnected && this.filesCollection) {
      const doc = await this.filesCollection.findOne({ id });
      if (!doc) return null;
      return {
        id: doc.id,
        projectId: doc.projectId,
        name: doc.name,
        folderId: doc.folderId,
        relativePath: doc.relativePath,
        size: doc.size,
        type: doc.type,
        storageFilename: doc.storageFilename,
        storagePath: doc.storagePath,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        isFolder: false,
      };
    }

    return this.memoryState.files.find((f) => f.id === id) || null;
  }

  async getFileStream(id: string): Promise<{ stream: fs.ReadStream; file: FileRecord }> {
    const file = await this.getFileById(id);
    if (!file) {
      throw new Error(`File with ID "${id}" not found.`);
    }

    const fullPath = path.join(this.uploadsDir, file.storageFilename);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(path.resolve(this.uploadsDir))) {
      throw new Error('Access denied: Invalid storage path.');
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File content not found on disk at "${file.storageFilename}".`);
    }

    return {
      stream: fs.createReadStream(fullPath),
      file,
    };
  }

  async deleteFile(id: string): Promise<FileRecord> {
    await this.init();

    const file = await this.getFileById(id);
    if (!file) {
      throw new Error(`File with ID "${id}" not found.`);
    }

    const fullPath = path.join(this.uploadsDir, file.storageFilename);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.warn(`Could not remove file ${fullPath} from disk:`, err);
      }
    }

    if (this.isMongoConnected && this.filesCollection) {
      await this.filesCollection.deleteOne({ id });
    }

    this.memoryState.files = this.memoryState.files.filter((f) => f.id !== id);
    this.saveDiskMetadata();

    return file;
  }

  // --- Directory Navigation Helper ---

  async getDirectoryContents(projectId: string, folderId: string | null = null) {
    await this.init();

    let currentFolder: FolderRecord | null = null;
    const breadcrumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Root' }];

    if (folderId) {
      currentFolder = await this.getFolderById(folderId);
      if (!currentFolder || currentFolder.projectId !== projectId) {
        throw new Error(`Folder "${folderId}" does not exist in this project.`);
      }

      // Build breadcrumbs
      const pathSegments: { id: string; name: string }[] = [];
      let cur: FolderRecord | null = currentFolder;
      while (cur) {
        pathSegments.unshift({ id: cur.id, name: cur.name });
        cur = cur.parentId ? await this.getFolderById(cur.parentId) : null;
      }
      breadcrumbs.push(...pathSegments);
    }

    const folders = await this.getFolders(projectId, folderId);
    const files = await this.getFiles(projectId, folderId);

    return {
      projectId,
      currentFolder,
      breadcrumbs,
      folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // --- Utilities ---

  private sanitizeName(input: string): string {
    if (!input) return '';
    // Strip path traversal sequences and unwanted characters
    const base = path.basename(input.trim());
    return base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  }

  async close(): Promise<void> {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.isMongoConnected = false;
    }
  }
}

export const storageManager = new StorageManager();
