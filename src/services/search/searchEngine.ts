import type { Conversation, Message, Project, ProjectFile, ProjectNote, SearchResult } from '../../types';

export function searchAll(
  query: string,
  projects: Project[],
  conversations: Conversation[],
  messages: Message[],
  notes: ProjectNote[],
  files: ProjectFile[],
  projectFilterId?: string
): SearchResult[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return [];

  const results: SearchResult[] = [];

  // Search Projects (always match if not filtered or matches projectFilterId)
  for (const p of projects) {
    if (projectFilterId && p.id !== projectFilterId) continue;
    if (
      p.name.toLowerCase().includes(cleanQuery) ||
      (p.description && p.description.toLowerCase().includes(cleanQuery))
    ) {
      results.push({
        id: p.id,
        type: 'project',
        title: p.name,
        snippet: p.description || 'Project Folder',
        projectId: p.id,
      });
    }
  }

  // Search Conversations
  for (const c of conversations) {
    if (projectFilterId && c.projectId !== projectFilterId) continue;
    if (c.title.toLowerCase().includes(cleanQuery)) {
      results.push({
        id: c.id,
        type: 'conversation',
        title: c.title,
        snippet: `Conversation with ${c.messageCount} messages`,
        projectId: c.projectId,
        conversationId: c.id,
      });
    }
  }

  // Search Messages
  for (const m of messages) {
    if (projectFilterId && m.projectId !== projectFilterId) continue;
    if (m.content.toLowerCase().includes(cleanQuery)) {
      const idx = m.content.toLowerCase().indexOf(cleanQuery);
      const start = Math.max(0, idx - 40);
      const end = Math.min(m.content.length, idx + cleanQuery.length + 60);
      const snippet =
        (start > 0 ? '...' : '') +
        m.content.substring(start, end).replace(/\n/g, ' ') +
        (end < m.content.length ? '...' : '');

      results.push({
        id: m.id,
        type: 'message',
        title: m.role === 'user' ? 'User Prompt' : 'AI Response',
        snippet,
        projectId: m.projectId,
        conversationId: m.conversationId,
      });
    }
  }

  // Search Notes
  for (const n of notes) {
    if (projectFilterId && n.projectId !== projectFilterId) continue;
    if (n.title.toLowerCase().includes(cleanQuery) || n.content.toLowerCase().includes(cleanQuery)) {
      const idx = n.content.toLowerCase().indexOf(cleanQuery);
      const snippet =
        idx !== -1
          ? n.content.substring(Math.max(0, idx - 30), Math.min(n.content.length, idx + 60)).replace(/\n/g, ' ')
          : n.title;

      results.push({
        id: n.id,
        type: 'note',
        title: n.title,
        snippet,
        projectId: n.projectId,
      });
    }
  }

  // Search Files (search both file name and extracted textPreview)
  for (const f of files) {
    if (projectFilterId && f.projectId !== projectFilterId) continue;
    const nameMatch = f.name.toLowerCase().includes(cleanQuery);
    const contentMatch = f.textPreview && f.textPreview.toLowerCase().includes(cleanQuery);

    if (nameMatch || contentMatch) {
      let snippet = `${(f.size / 1024).toFixed(1)} KB • Uploaded document`;
      if (contentMatch && f.textPreview) {
        const idx = f.textPreview.toLowerCase().indexOf(cleanQuery);
        snippet =
          (idx > 30 ? '...' : '') +
          f.textPreview.substring(Math.max(0, idx - 30), Math.min(f.textPreview.length, idx + 60)).replace(/\n/g, ' ') +
          (idx + 60 < f.textPreview.length ? '...' : '');
      }

      results.push({
        id: f.id,
        type: 'file',
        title: f.name,
        snippet,
        projectId: f.projectId,
      });
    }
  }

  return results.slice(0, 30); // Return up to top 30 relevant results
}
