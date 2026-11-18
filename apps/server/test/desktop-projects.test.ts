import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDesktopProjects } from '../src/desktop-projects.js';

const directories: string[] = [];
async function stateHome(state?: unknown): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'cmr-projects-'));
  directories.push(home);
  if (state !== undefined) await writeFile(join(home, '.codex-global-state.json'), JSON.stringify(state));
  return home;
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe('readDesktopProjects', () => {
  it('preserves Desktop names, Windows roots and saved order, exposing only whitelisted fields', async () => {
    const home = await stateHome({
      'local-projects': {
        archive: { id: 'archive', name: 'Archive', rootPaths: ['D:\\work\\Archive'], privateNotes: 'private' },
        cloud: { id: 'cloud', name: '示例服务', rootPaths: ['D:\\work\\demo-api'] },
        robot: { id: 'robot', name: '示例机器人', rootPaths: ['E:\\robot-demo'] },
      },
      'project-order': ['robot', 'cloud', 'missing', 'robot'],
      'thread-project-assignments': {},
      'projectless-thread-ids': [],
      credentials: 'must not leave the state file',
    });
    const original = await readFile(join(home, '.codex-global-state.json'), 'utf8');

    expect(await readDesktopProjects(home)).toEqual({ available: true, projects: [
      { id: 'robot', name: '示例机器人', rootPaths: ['E:\\robot-demo'], threadIds: [] },
      { id: 'cloud', name: '示例服务', rootPaths: ['D:\\work\\demo-api'], threadIds: [] },
      { id: 'archive', name: 'Archive', rootPaths: ['D:\\work\\Archive'], threadIds: [] },
    ] });
    expect(await readFile(join(home, '.codex-global-state.json'), 'utf8')).toBe(original);
  });

  it('uses explicit local assignments and lets projectless override stale assignments', async () => {
    const home = await stateHome({
      'local-projects': { cloud: { id: 'cloud', name: '示例服务', rootPaths: ['D:\\work'] } },
      'thread-project-assignments': {
        assigned: { projectKind: 'local', projectId: 'cloud' },
        projectless: { projectKind: 'local', projectId: 'cloud' },
        external: { projectKind: 'remote', projectId: 'cloud' },
        unknown: { projectKind: 'local', projectId: 'missing' },
      },
      'projectless-thread-ids': ['projectless'],
      'electron-saved-workspace-roots': ['D:\\stray-directory'],
    });

    expect(await readDesktopProjects(home)).toEqual({ available: true, projects: [
      { id: 'cloud', name: '示例服务', rootPaths: ['D:\\work'], threadIds: ['assigned'] },
    ] });
  });

  it('accepts a valid empty Desktop project collection', async () => {
    expect(await readDesktopProjects(await stateHome({ 'local-projects': {} }))).toEqual({ projects: [], available: true });
  });

  it('reports unavailable when Desktop state is absent or JSON is damaged', async () => {
    const home = await stateHome();
    expect(await readDesktopProjects(home)).toEqual({ projects: [], available: false });
    await writeFile(join(home, '.codex-global-state.json'), '{broken');
    expect(await readDesktopProjects(home)).toEqual({ projects: [], available: false });
  });

  it.each([
    null,
    [],
    {},
    { 'local-projects': [] },
    { 'local-projects': { bad: { id: 'bad', name: 'Bad', rootPaths: 'D:\\bad' } } },
    { 'local-projects': { bad: { id: 'other', name: 'Bad', rootPaths: [] } } },
    { 'local-projects': {}, 'project-order': {} },
    { 'local-projects': {}, 'project-order': null },
    { 'local-projects': {}, 'thread-project-assignments': [] },
    { 'local-projects': {}, 'thread-project-assignments': null },
    { 'local-projects': {}, 'projectless-thread-ids': 'thread' },
    { 'local-projects': {}, 'projectless-thread-ids': null },
  ])('does not infer projects from malformed metadata: %j', async (state) => {
    expect(await readDesktopProjects(await stateHome(state))).toEqual({ projects: [], available: false });
  });

  it('bounds the state file read instead of accepting oversized data', async () => {
    const home = await stateHome();
    await writeFile(join(home, '.codex-global-state.json'), `{"local-projects":{},"padding":"${'x'.repeat(8 * 1024 * 1024)}"}`);
    expect(await readDesktopProjects(home)).toEqual({ projects: [], available: false });
  });
});
