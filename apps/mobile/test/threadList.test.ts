import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PROJECT_COLLAPSE_STORAGE_KEY,
  buildThreadNavigation,
  projectThreadWindow,
  projectCollapsed,
  readProjectCollapsePreferences,
  toggleProjectCollapsePreference,
  writeProjectCollapsePreferences,
  ThreadList,
} from '../src/components/ThreadList';
import type { DesktopProject } from '../src/components/ThreadList';
import type { RemoteThread, ThreadState } from '../src/types/protocol';

function thread(
  id: string,
  cwd: string,
  updatedAt: number,
  state: ThreadState = 'idle',
  unread = 0,
): RemoteThread {
  return {
    id,
    title: id,
    preview: '',
    updatedAt,
    state,
    unread,
    cwd,
    modelProvider: '',
    parentThreadId: null,
    agentNickname: null,
    agentRole: null,
    source: null,
  };
}

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('ThreadList project grouping', () => {
  const projects: DesktopProject[] = [
    { id: 'cloud', name: '阿里云', rootPaths: ['D:\\work'], threadIds: ['a-old', 'a-new', 'reviewer'] },
    { id: 'empty', name: '陪伴机器人', rootPaths: ['E:\\roboduck'], threadIds: [] },
  ];

  const threads = [
    thread('a-old', 'D:\\other', 10),
    thread('stray-directory', 'D:\\work', 40),
    thread('a-new', 'D:\\work', 20),
    thread('without-cwd', '', 5),
    { ...thread('reviewer', 'D:\\work', 50), parentThreadId: 'a-new', agentRole: 'reviewer' },
    { ...thread('guardian', 'D:\\work', 60), title: 'Guardian review', parentThreadId: 'a-new' },
  ];

  it('uses only explicit Desktop assignments in saved project order, including empty projects', () => {
    const navigation = buildThreadNavigation(threads, projects);
    expect(navigation.projects.map((group) => [group.project.name, group.items.map((item) => item.id)])).toEqual([
      ['阿里云', ['a-new', 'a-old']],
      ['陪伴机器人', []],
    ]);
  });

  it('includes assigned and unassigned main threads in Recent by update time', () => {
    expect(buildThreadNavigation(threads, projects).recent.map((item) => item.id)).toEqual([
      'stray-directory', 'a-new', 'a-old', 'without-cwd',
    ]);
  });

  it('preserves ordinary subagents under their parent and removes Guardian from child counts', () => {
    const navigation = buildThreadNavigation(threads, projects);
    expect(navigation.childrenByParent.get('a-new')?.map((item) => item.id)).toEqual(['reviewer']);
  });

  it('shows Recent without inventing projects when project metadata is unavailable', () => {
    const navigation = buildThreadNavigation(threads);
    expect(navigation.projects).toEqual([]);
    expect(navigation.recent.map((item) => item.id)).toEqual(['stray-directory', 'a-new', 'a-old', 'without-cwd']);
  });

  it('renders named projects and Recent with ordinary subagent expansion controls', () => {
    const html = renderToStaticMarkup(createElement(ThreadList, {
      threads, projects, phase: 'connected', phaseDetail: '',
      onSelect() {}, onCreate() {}, onSettings() {}, onReconnect() {},
    }));
    expect(html).toContain('aria-label="项目"');
    expect(html).toContain('aria-label="最近"');
    expect(html).toContain('阿里云');
    expect(html).toContain('陪伴机器人');
    expect(html).toContain('title="D:\\work"');
    expect(html).not.toContain('<code');
    expect(html.replace(/<[^>]+>/g, '')).not.toContain('D:\\work');
    expect(html).toContain('展开 1 个 Subagent');
    expect(html).toContain('stray-directory');
    expect(html).not.toContain('Guardian review');
    expect(html).not.toContain('2 个 Subagent');
  });

  it('renders Recent for legacy callers that have not provided projects', () => {
    const html = renderToStaticMarkup(createElement(ThreadList, {
      threads: [thread('recent-only', 'D:\\deep\\directory', 1)], phase: 'connected', phaseDetail: '',
      onSelect() {}, onCreate() {}, onSettings() {}, onReconnect() {},
    }));
    expect(html).toContain('aria-label="最近"');
    expect(html).toContain('recent-only');
    expect(html).not.toContain('展开目录');
  });

  it('shows the latest five project roots by default while keeping all roots in Recent', () => {
    const roots = Array.from({ length: 8 }, (_, index) => thread(`task-${index + 1}`, 'D:\\work', index + 1));
    const html = renderToStaticMarkup(createElement(ThreadList, {
      threads: [
        ...roots,
        thread('unassigned', 'D:\\work', 50),
        { ...thread('reviewer', 'D:\\work', 70), parentThreadId: 'task-8', agentRole: 'reviewer' },
        { ...thread('guardian', 'D:\\work', 80), title: 'Guardian review' },
      ],
      projects: [{ id: 'cloud', name: '阿里云', rootPaths: ['D:\\work'], threadIds: roots.map((root) => root.id) }],
      phase: 'connected', phaseDetail: '',
      onSelect() {}, onCreate() {}, onSettings() {}, onReconnect() {},
    }));
    const [projectSection, recentSection = ''] = html.split('aria-label="最近"');
    expect([...projectSection!.matchAll(/<strong>([^<]+)<\/strong>/g)].map((match) => match[1])).toEqual([
      'Codex Remote', '阿里云', 'task-8', 'task-7', 'task-6', 'task-5', 'task-4',
    ]);
    expect(projectSection).toContain('展开显示');
    expect(projectSection).toContain('aria-expanded="false"');
    expect(projectSection).toContain('展开 1 个 Subagent');
    expect([...recentSection.matchAll(/<strong>([^<]+)<\/strong>/g)].map((match) => match[1])).toEqual([
      'unassigned', 'task-8', 'task-7', 'task-6', 'task-5', 'task-4', 'task-3', 'task-2', 'task-1',
    ]);
    expect(html).toContain('aria-label="阿里云，8 个会话，折叠项目"');
    expect(html).not.toContain('Guardian review');
  });

  it('does not offer more rows for projects that fit within five roots', () => {
    const html = renderToStaticMarkup(createElement(ThreadList, {
      threads, projects, phase: 'connected', phaseDetail: '',
      onSelect() {}, onCreate() {}, onSettings() {}, onReconnect() {},
    }));
    expect(html).not.toContain('展开显示');
  });

  it('keeps task identity, approval state and unread count without preview or token clutter', () => {
    const html = renderToStaticMarkup(createElement(ThreadList, {
      threads: [{ ...thread('Needs approval', 'D:\\work', Date.now(), 'waiting_approval', 3),
        preview: 'SECONDARY_PREVIEW', lastTurnDurationMs: 123456,
        tokenUsage: { totalTokens: 987654, inputTokens: 1, outputTokens: 2, reasoningOutputTokens: 3 },
      }],
      phase: 'connected', phaseDetail: '',
      onSelect() {}, onCreate() {}, onSettings() {}, onReconnect() {},
    }));
    expect(html).toContain('Needs approval');
    expect(html).toContain('state-waiting_approval');
    expect(html).toContain('class="unread-badge">3</span>');
    expect(html).not.toContain('SECONDARY_PREVIEW');
    expect(html).not.toContain('tokens');
    expect(html).not.toContain('用时');
  });
});

describe('ThreadList compact project navigation', () => {
  it('can expand all project roots and return to the same first five without changing the source', () => {
    const roots = Array.from({ length: 7 }, (_, index) => thread(`task-${index + 1}`, 'D:\\work', index + 1));
    expect(projectThreadWindow(roots, false).map((item) => item.id)).toEqual(['task-1', 'task-2', 'task-3', 'task-4', 'task-5']);
    expect(projectThreadWindow(roots, true).map((item) => item.id)).toEqual(['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6', 'task-7']);
    expect(projectThreadWindow(roots, false).map((item) => item.id)).toEqual(['task-1', 'task-2', 'task-3', 'task-4', 'task-5']);
    expect(roots).toHaveLength(7);
  });

  it('fully folds a project only after an explicit choice and preserves independent project choices', () => {
    expect(projectCollapsed('project:cloud', {})).toBe(false);
    const folded = toggleProjectCollapsePreference('project:cloud', {});
    expect(projectCollapsed('project:cloud', folded)).toBe(true);
    expect(projectCollapsed('project:robot', folded)).toBe(false);

    const robotFolded = toggleProjectCollapsePreference('project:robot', folded);
    const cloudReopened = toggleProjectCollapsePreference('project:cloud', robotFolded);
    expect(projectCollapsed('project:cloud', cloudReopened)).toBe(false);
    expect(projectCollapsed('project:robot', cloudReopened)).toBe(true);
  });
});

describe('ThreadList project collapse persistence', () => {
  it('round-trips explicit expanded and collapsed choices through local storage', () => {
    const storage = new MemoryStorage();
    writeProjectCollapsePreferences({ '/work/a': true, '/work/b': false }, storage);

    expect(storage.getItem(PROJECT_COLLAPSE_STORAGE_KEY)).toBe('{"/work/a":true,"/work/b":false}');
    expect(readProjectCollapsePreferences(storage)).toEqual({ '/work/a': true, '/work/b': false });
  });

  it('ignores malformed and non-boolean stored values without breaking the list', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROJECT_COLLAPSE_STORAGE_KEY, '{"/work/a":true,"/work/b":"yes","":false}');
    expect(readProjectCollapsePreferences(storage)).toEqual({ '/work/a': true });

    storage.setItem(PROJECT_COLLAPSE_STORAGE_KEY, '{broken');
    expect(readProjectCollapsePreferences(storage)).toEqual({});
  });
});
