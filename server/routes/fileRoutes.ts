import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { storageManager } from '../storage/storageManager.ts';

const router = Router();

// Configure Multer with in-memory buffering so we can handle zero-byte files cleanly
// and safely validate before writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 Megabytes per file
    files: 50, // Up to 50 files per batch
  },
});

// --- Folder Endpoints ---

/**
 * POST /api/folders
 * Create an explicit folder
 */
router.post('/folders', async (req: Request, res: Response) => {
  try {
    const { projectId, name, parentId } = req.body;
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      return res.status(400).json({ error: 'Field "projectId" is required.' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Field "name" is required and cannot be empty.' });
    }

    const folder = await storageManager.createFolder(
      projectId.trim(),
      name.trim(),
      parentId ? String(parentId).trim() : null
    );

    res.status(201).json({ success: true, folder });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create folder.' });
  }
});

/**
 * GET /api/folders
 * List folders for a project, optionally filtered by parentId
 */
router.get('/folders', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      return res.status(400).json({ error: 'Query parameter "projectId" is required.' });
    }

    let parentId: string | null | undefined = undefined;
    if (req.query.parentId !== undefined) {
      parentId = req.query.parentId === 'null' || req.query.parentId === '' ? null : (req.query.parentId as string);
    }

    const folders = await storageManager.getFolders(projectId, parentId);
    res.json({ success: true, folders });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list folders.' });
  }
});

/**
 * DELETE /api/folders/:id
 * Delete folder and cascade delete all nested folders & files
 */
router.delete('/folders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await storageManager.deleteFolder(id);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete folder.' });
  }
});

// --- File Endpoints ---

/**
 * POST /api/files/upload
 * Upload one or more files (supporting zero-byte files & nested paths)
 */
router.post('/files/upload', upload.array('files', 50), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    const { projectId, folderId, relativePath } = req.body;

    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      return res.status(400).json({ error: 'Field "projectId" is required.' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files were provided in the upload request.' });
    }

    const targetFolderId = folderId && folderId !== 'null' && folderId !== 'undefined' ? folderId : null;

    const savedFiles = [];
    for (const f of files) {
      // Decode originalname properly to preserve UTF-8 filenames
      const originalName = Buffer.from(f.originalname, 'latin1').toString('utf8');

      // Relative path if provided (e.g., from webkitRelativePath during directory upload)
      const relPath = (req.body[`relPath_${f.originalname}`] as string) || relativePath || undefined;

      const saved = await storageManager.saveFile({
        projectId: projectId.trim(),
        originalName,
        buffer: f.buffer, // Supports 0-byte buffer.length === 0
        mimeType: f.mimetype,
        folderId: targetFolderId,
        relativePath: relPath,
      });

      savedFiles.push(saved);
    }

    res.status(201).json({ success: true, files: savedFiles });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to upload file(s).' });
  }
});

/**
 * GET /api/files
 * List files for a project, optionally filtered by folderId
 */
router.get('/files', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      return res.status(400).json({ error: 'Query parameter "projectId" is required.' });
    }

    let folderId: string | null | undefined = undefined;
    if (req.query.folderId !== undefined) {
      folderId = req.query.folderId === 'null' || req.query.folderId === '' ? null : (req.query.folderId as string);
    }

    const files = await storageManager.getFiles(projectId, folderId);
    res.json({ success: true, files });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list files.' });
  }
});

/**
 * GET /api/files/:id
 * Retrieve file metadata
 */
router.get('/files/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = await storageManager.getFileById(id);
    if (!file) {
      return res.status(404).json({ error: `File with ID "${id}" not found.` });
    }
    res.json({ success: true, file });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve file metadata.' });
  }
});

/**
 * GET /api/files/:id/download
 * Download file content stream
 */
router.get('/files/:id/download', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stream, file } = await storageManager.getFileStream(id);

    // Set download headers
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', file.type || 'application/octet-stream');
    res.setHeader('Content-Length', file.size);

    stream.on('error', (err) => {
      console.error(`Stream error downloading file ${id}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file content.' });
      }
    });

    stream.pipe(res);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'File not found or unreadable.' });
  }
});

/**
 * DELETE /api/files/:id
 * Delete file from disk and database
 */
router.delete('/files/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await storageManager.deleteFile(id);
    res.json({ success: true, deletedFile: deleted });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete file.' });
  }
});

/**
 * GET /api/directory
 * Get directory contents (subfolders + files + breadcrumbs)
 */
router.get('/directory', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      return res.status(400).json({ error: 'Query parameter "projectId" is required.' });
    }

    const folderId = req.query.folderId && req.query.folderId !== 'null' && req.query.folderId !== ''
      ? (req.query.folderId as string)
      : null;

    const contents = await storageManager.getDirectoryContents(projectId, folderId);
    res.json({ success: true, ...contents });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to load directory contents.' });
  }
});

export default router;
