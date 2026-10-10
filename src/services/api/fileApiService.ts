import type { ProjectFile, ProjectFolder } from '../../types';

const getApiBase = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:3001/api';
};

export interface DirectoryContentsResponse {
  success: boolean;
  projectId: string;
  currentFolder: ProjectFolder | null;
  breadcrumbs: { id: string | null; name: string }[];
  folders: ProjectFolder[];
  files: ProjectFile[];
}

export class FileApiService {
  private get base() {
    return getApiBase();
  }

  async getDirectory(projectId: string, folderId: string | null = null): Promise<DirectoryContentsResponse> {
    const url = new URL(
      `${this.base}/directory`,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'
    );
    url.searchParams.set('projectId', projectId);
    if (folderId) {
      url.searchParams.set('folderId', folderId);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch directory: HTTP ${res.status}`);
    }
    return res.json();
  }

  async createFolder(projectId: string, name: string, parentId: string | null = null): Promise<ProjectFolder> {
    const res = await fetch(`${this.base}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name, parentId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create folder: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.folder;
  }

  async deleteFolder(folderId: string): Promise<{ deletedFolders: string[]; deletedFiles: string[] }> {
    const res = await fetch(`${this.base}/folders/${encodeURIComponent(folderId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to delete folder: HTTP ${res.status}`);
    }

    return res.json();
  }

  async uploadFiles(params: {
    projectId: string;
    files: File[];
    folderId?: string | null;
    relPaths?: Record<string, string>;
  }): Promise<ProjectFile[]> {
    const { projectId, files, folderId, relPaths } = params;

    const formData = new FormData();
    formData.append('projectId', projectId);
    if (folderId) {
      formData.append('folderId', folderId);
    }

    for (const file of files) {
      formData.append('files', file);
      if (relPaths && relPaths[file.name]) {
        formData.append(`relPath_${file.name}`, relPaths[file.name]);
      }
    }

    const res = await fetch(`${this.base}/files/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.files;
  }

  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(`${this.base}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to delete file: HTTP ${res.status}`);
    }
  }

  async downloadFile(fileId: string, fileName: string): Promise<void> {
    const downloadUrl = `${this.base}/files/${encodeURIComponent(fileId)}/download`;
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download file: HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}

export const fileApiService = new FileApiService();
