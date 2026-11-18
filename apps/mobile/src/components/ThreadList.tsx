import { useEffect, useMemo, useState } from 'react';
import { threadStateLabel } from '../hooks/useRemote';
import type { ConnectionPhase, RemoteThread } from '../types/protocol';
import { ConnectionStatus } from './ConnectionStatus';
import { ElapsedTime } from './ElapsedTime';
import { PlusIcon, SettingsIcon } from './Icons';
import { isGuardianThread } from '../lib/threadVisibility';
import '../project-navigation.css';

export const PROJECT_COLLAPSE_STORAGE_KEY = 'codex-mobile.project-collapse.v1';
export const PROJECT_VISIBLE_THREAD_LIMIT = 5;

type ProjectCollapsePreferences = Record<string, boolean>;
type ProjectCollapseStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface DesktopProject {
  id: string;
  name: string;
  rootPaths: string[];
  threadIds: string[];
}

export interface ProjectThreadGroup {
  project: DesktopProject;
  items: RemoteThread[];
}

function browserStorage(): ProjectCollapseStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readProjectCollapsePreferences(storage: ProjectCollapseStorage | null = browserStorage()): ProjectCollapsePreferences {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(PROJECT_COLLAPSE_STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, collapsed]) => key.length > 0 && typeof collapsed === 'boolean'),
    );
  } catch {
    return {};
  }
}

export function writeProjectCollapsePreferences(
  preferences: ProjectCollapsePreferences,
  storage: ProjectCollapseStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PROJECT_COLLAPSE_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Browsing storage can be unavailable or full; folding must remain usable in memory.
  }
}

export function buildThreadNavigation(threads: RemoteThread[], projects: DesktopProject[] = []): {
  projects: ProjectThreadGroup[];
  recent: RemoteThread[];
  childrenByParent: Map<string, RemoteThread[]>;
} {
  const visible = threads.filter((thread) => !isGuardianThread(thread)).sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = visible.filter((thread) => !thread.parentThreadId);
  const childrenByParent = new Map<string, RemoteThread[]>();
  for (const thread of visible) {
    if (!thread.parentThreadId) continue;
    const children = childrenByParent.get(thread.parentThreadId) ?? [];
    children.push(thread);
    childrenByParent.set(thread.parentThreadId, children);
  }
  return {
    projects: projects.map((project) => {
      const assigned = new Set(project.threadIds);
      const items = recent.filter((thread) => assigned.has(thread.id));
      return { project, items };
    }),
    recent,
    childrenByParent,
  };
}

export function projectThreadWindow(items: RemoteThread[], expanded: boolean): RemoteThread[] {
  return expanded ? items : items.slice(0, PROJECT_VISIBLE_THREAD_LIMIT);
}

export function projectCollapsed(
  projectKey: string,
  preferences: ProjectCollapsePreferences,
): boolean {
  return preferences[projectKey] === true;
}

export function toggleProjectCollapsePreference(
  projectKey: string,
  preferences: ProjectCollapsePreferences,
): ProjectCollapsePreferences {
  return {
    ...preferences,
    [projectKey]: !projectCollapsed(projectKey, preferences),
  };
}

interface ThreadListProps {
  threads: RemoteThread[];
  projects?: DesktopProject[];
  phase: ConnectionPhase;
  phaseDetail: string;
  onSelect: (threadId: string) => void;
  onCreate: () => void;
  onSettings: () => void;
  onReconnect: () => void;
}

function relativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`;
  return `${Math.floor(seconds / 86400)} 天`;
}

function FolderIcon() {
  return (
    <svg className="project-folder-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function ThreadRow({
  thread,
  childrenByParent,
  depth,
  onSelect,
  expandedParents,
  onToggleChildren,
}: {
  thread: RemoteThread;
  childrenByParent: Map<string, RemoteThread[]>;
  depth: number;
  onSelect: (threadId: string) => void;
  expandedParents: Set<string>;
  onToggleChildren: (threadId: string) => void;
}) {
  const children = childrenByParent.get(thread.id) ?? [];
  const isAgent = Boolean(thread.parentThreadId || thread.agentNickname || thread.agentRole);
  const childrenCollapsed = !expandedParents.has(thread.id);
  const needsAttention = thread.state === 'waiting_approval' || thread.state === 'waiting_input' || thread.state === 'error';
  const rowStyle = {
    '--thread-indent': `${Math.min(depth, 4) * 14}px`,
  } as React.CSSProperties;

  return (
    <>
      <button
        className={`thread-card ${isAgent ? 'thread-card-agent' : ''}`}
        style={rowStyle}
        type="button"
        title={isAgent && thread.agentRole ? `${thread.title} · ${thread.agentRole}` : thread.title}
        onClick={() => onSelect(thread.id)}
      >
        <span className={`thread-state state-${thread.state}`} aria-label={threadStateLabel(thread.state)}><span /></span>
        <span className="thread-main">
          <span className="thread-title-row">
            <strong>{isAgent ? thread.agentNickname || thread.title || 'Subagent' : thread.title || '未命名任务'}</strong>
            {needsAttention && <span className={`state-label state-label-${thread.state}`}>{threadStateLabel(thread.state)}</span>}
            <span className="thread-time">{thread.state === 'running' && thread.currentTurnStartedAt
              ? <ElapsedTime startedAt={thread.currentTurnStartedAt} />
              : relativeTime(thread.updatedAt)}</span>
          </span>
        </span>
        {Boolean(thread.unread) && <span className="unread-badge">{thread.unread}</span>}
      </button>
      {children.length > 0 && (
        <button
          className="subagent-toggle"
          style={rowStyle}
          type="button"
          onClick={() => onToggleChildren(thread.id)}
          aria-expanded={!childrenCollapsed}
        >
          <span>{childrenCollapsed ? '展开' : '收起'} {children.length} 个 Subagent</span>
          <span aria-hidden="true">{childrenCollapsed ? '⌄' : '⌃'}</span>
        </button>
      )}
      {!childrenCollapsed && children.map((child) => (
        <ThreadRow
          key={child.id}
          thread={child}
          childrenByParent={childrenByParent}
          depth={depth + 1}
          onSelect={onSelect}
          expandedParents={expandedParents}
          onToggleChildren={onToggleChildren}
        />
      ))}
    </>
  );
}

export function ThreadList({ threads, projects, phase, phaseDetail, onSelect, onCreate, onSettings, onReconnect }: ThreadListProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectCollapsePreferences, setProjectCollapsePreferences] = useState<ProjectCollapsePreferences>(
    () => readProjectCollapsePreferences(),
  );
  useEffect(() => {
    writeProjectCollapsePreferences(projectCollapsePreferences);
  }, [projectCollapsePreferences]);

  const toggleChildren = (threadId: string) => {
    setExpandedParents((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const navigation = useMemo(() => buildThreadNavigation(threads, projects), [threads, projects]);
  const { projects: groups, recent, childrenByParent } = navigation;

  const toggleProject = (projectKey: string) => {
    setProjectCollapsePreferences((current) => toggleProjectCollapsePreference(projectKey, current));
  };

  const toggleProjectRows = (projectId: string) => {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <main className="app-screen thread-screen">
      <header className="top-bar thread-top-bar">
        <div className="app-identity">
          <img src="/logo.svg?v=4" alt="" className="top-logo" />
          <div>
            <strong>Codex Remote</strong>
            <span>项目与最近会话</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-button" type="button" onClick={onSettings} aria-label="连接设置"><SettingsIcon /></button>
          <button className="new-thread-button" type="button" onClick={onCreate} disabled={phase !== 'connected'}>
            <PlusIcon /> <span>新任务</span>
          </button>
        </div>
      </header>

      <div className="status-row">
        <ConnectionStatus phase={phase} detail={phaseDetail} onReconnect={onReconnect} />
        <span className="thread-count">{groups.length} 个项目 · {recent.length} 个会话</span>
      </div>

      {recent.some((thread) => thread.state === 'not_loaded') && (
        <details className="state-scope-note">
          <summary>“未载入”表示什么？</summary>
          <p>这是 Codex app-server 返回的明确状态：任务存在，但当前没有驻留运行时。打开任务后，手机会优先通过 Desktop IPC 跟随桌面 owner，并显示执行、审批、等待输入或空闲状态。</p>
        </details>
      )}

      <section className="thread-list" aria-label="任务列表">
        {groups.length > 0 && (
          <section className="project-navigation-section" aria-label="项目">
            <h2 className="project-navigation-title">项目</h2>
            {groups.map(({ project, items }) => {
              const preferenceKey = `project:${project.id}`;
              const collapsed = projectCollapsed(preferenceKey, projectCollapsePreferences);
              const rootsLabel = project.rootPaths.join('\n');
              const rowsExpanded = expandedProjects.has(project.id);
              const visibleItems = projectThreadWindow(items, rowsExpanded);
              return (
                <section className={`project-group ${collapsed ? 'project-group-collapsed' : ''}`} key={project.id}>
                  <header className="project-heading">
                    <button
                      className="project-heading-button"
                      type="button"
                      title={rootsLabel || undefined}
                      onClick={() => toggleProject(preferenceKey)}
                      aria-expanded={!collapsed}
                      aria-label={`${project.name}，${items.length} 个会话，${collapsed ? '展开项目' : '折叠项目'}`}
                    >
                      <span className="project-heading-copy">
                        <FolderIcon />
                        <strong>{project.name}</strong>
                      </span>
                      <span className="project-heading-meta">
                        <span className="project-task-count">{items.length}</span>
                        <span className="project-chevron" aria-hidden="true">{collapsed ? '⌄' : '⌃'}</span>
                      </span>
                    </button>
                  </header>
                  {!collapsed && (
                    <div className="project-threads" id={`project-threads-${project.id}`}>
                      {items.length === 0 && <p className="project-navigation-empty">暂无会话</p>}
                      {visibleItems.map((thread) => (
                        <ThreadRow key={thread.id} thread={thread} childrenByParent={childrenByParent} depth={0} onSelect={onSelect} expandedParents={expandedParents} onToggleChildren={toggleChildren} />
                      ))}
                      {items.length > PROJECT_VISIBLE_THREAD_LIMIT && (
                        <button
                          className="project-more-button"
                          type="button"
                          onClick={() => toggleProjectRows(project.id)}
                          aria-expanded={rowsExpanded}
                          aria-controls={`project-threads-${project.id}`}
                          aria-label={`${project.name}，${rowsExpanded ? '收起显示' : '展开显示'} ${items.length} 个会话`}
                        >
                          <span>{rowsExpanded ? '收起显示' : '展开显示'}</span>
                          {!rowsExpanded && <span className="project-more-count">+{items.length - PROJECT_VISIBLE_THREAD_LIMIT}</span>}
                          <span aria-hidden="true">{rowsExpanded ? '⌃' : '⌄'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </section>
        )}
        <section className="project-navigation-section recent-navigation" aria-label="最近">
          <h2 className="project-navigation-title">最近</h2>
          {recent.length === 0 ? (
            <div className="empty-state">
              <div className="empty-glyph" aria-hidden="true"><span /></div>
              <h2>{phase === 'connected' ? '暂无任务' : '正在等待 Codex'}</h2>
              <p>{phase === 'connected' ? '创建任务，或等待电脑端的任务同步到这里。' : '连接就绪后，历史任务会自动显示。'}</p>
            </div>
          ) : recent.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} childrenByParent={childrenByParent} depth={0} onSelect={onSelect} expandedParents={expandedParents} onToggleChildren={toggleChildren} />
          ))}
        </section>
      </section>
    </main>
  );
}
