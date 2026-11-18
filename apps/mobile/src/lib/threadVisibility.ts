export interface ThreadVisibilityMetadata {
  title?: string | null;
  name?: string | null;
  label?: string | null;
  agentNickname?: string | null;
  agentRole?: string | null;
  role?: string | null;
  source?: unknown;
  threadSource?: unknown;
  thread_source?: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function guardianMarker(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return ['guardian', 'guardian_review', 'guardian_reviewer', 'guardian_subagent']
    .includes(value.trim().toLowerCase().replace(/[\s-]+/g, '_'));
}

function guardianSource(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (guardianMarker(value)) return true;
  if (typeof value === 'string') {
    if (value.length > 8192 || !value.trimStart().startsWith('{')) return false;
    try { return guardianSource(JSON.parse(value), depth + 1); } catch { return false; }
  }
  const source = record(value);
  if (!source) return false;
  for (const key of ['type', 'kind', 'threadSource', 'thread_source', 'agentRole', 'agent_role']) {
    if (guardianMarker(source[key])) return true;
  }
  for (const key of ['subagent', 'subAgent', 'sub_agent']) {
    const subagent = record(source[key]);
    if (subagent && (guardianMarker(subagent.other) || guardianSource(subagent, depth + 1)
      || guardianSource(subagent.thread_spawn ?? subagent.threadSpawn, depth + 1))) return true;
  }
  return guardianSource(source.original, depth + 1);
}

/** Match auxiliary Guardian identity, never task text, generic reviewers or approval settings. */
export function isGuardianThread(thread: ThreadVisibilityMetadata): boolean {
  if (guardianMarker(thread.agentRole) || guardianMarker(thread.role)
    || guardianSource(thread.source) || guardianMarker(thread.threadSource) || guardianMarker(thread.thread_source)) return true;
  return [thread.title, thread.name, thread.label, thread.agentNickname]
    .some((name) => typeof name === 'string' && /^guardian[\s_-]+review$/i.test(name.trim()));
}
