import { open } from 'node:fs/promises';
import { join } from 'node:path';

export interface DesktopProject {
  id: string;
  name: string;
  rootPaths: string[];
  threadIds: string[];
}

const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_PROJECTS = 10_000;
const MAX_THREADS = 100_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function strings(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit
    && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 32_768);
}

/** Read Desktop's explicit local project metadata without exporting unrelated state. */
export async function readDesktopProjects(codexHome: string): Promise<{ projects: DesktopProject[]; available: boolean }> {
  const unavailable = { projects: [], available: false };
  try {
    const file = await open(join(codexHome, '.codex-global-state.json'), 'r');
    let raw: unknown;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > MAX_STATE_BYTES) return unavailable;
      // The extra byte detects a file that grew after stat; never read unbounded state.
      const buffer = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > info.size) return unavailable;
      raw = JSON.parse(buffer.toString('utf8', 0, length));
    } finally {
      await file.close();
    }

    const state = record(raw);
    const localProjects = record(state?.['local-projects']);
    if (!state || !localProjects) return unavailable;
    const order = state['project-order'] === undefined ? [] : state['project-order'];
    const assignments = record(state['thread-project-assignments'] === undefined ? {} : state['thread-project-assignments']);
    const projectless = state['projectless-thread-ids'] === undefined ? [] : state['projectless-thread-ids'];
    if (!strings(order, MAX_PROJECTS) || !assignments || !strings(projectless, MAX_THREADS)) return unavailable;

    const entries = Object.entries(localProjects);
    const assignmentEntries = Object.entries(assignments);
    if (entries.length > MAX_PROJECTS || assignmentEntries.length > MAX_THREADS) return unavailable;
    const byId = new Map<string, DesktopProject>();
    for (const [id, value] of entries) {
      const project = record(value);
      if (!id || !project || project.id !== id || typeof project.name !== 'string'
        || !project.name.trim() || !strings(project.rootPaths, 100)) return unavailable;
      byId.set(id, { id, name: project.name, rootPaths: [...project.rootPaths], threadIds: [] });
    }

    const projectlessIds = new Set(projectless);
    for (const [threadId, value] of assignmentEntries) {
      const assignment = record(value);
      if (!assignment || typeof assignment.projectKind !== 'string' || typeof assignment.projectId !== 'string') return unavailable;
      if (assignment.projectKind !== 'local' || projectlessIds.has(threadId)) continue;
      byId.get(assignment.projectId)?.threadIds.push(threadId);
    }

    const orderedIds = new Set([...order, ...byId.keys()]);
    return {
      projects: [...orderedIds].flatMap((id) => {
        const project = byId.get(id);
        return project ? [project] : [];
      }),
      available: true,
    };
  } catch {
    // Missing, changing or invalid Desktop state must not invent cwd-based projects.
    return unavailable;
  }
}
