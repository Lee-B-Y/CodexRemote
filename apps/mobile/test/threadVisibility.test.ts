import { describe, expect, it } from 'vitest';
import { isGuardianThread } from '../src/lib/threadVisibility';

describe('Guardian auxiliary thread visibility', () => {
  it.each([
    { source: { subagent: { other: 'guardian' } } },
    { source: { original: { subAgent: { other: 'guardian' } } } },
    { source: '{"subagent":{"other":"guardian"}}' },
    { source: 'guardian_review' },
    { source: { type: 'guardian_review' } },
    { agentRole: 'guardian' },
    { agentRole: 'guardian_reviewer' },
    { title: 'Guardian review' },
    { name: 'Guardian review' },
    { agentNickname: 'Guardian review' },
  ])('hides an explicit Guardian review thread: %j', (thread) => {
    expect(isGuardianThread(thread)).toBe(true);
  });

  it.each([
    { title: 'Review mobile changes', agentRole: 'reviewer' },
    { title: 'Debug Guardian review visibility', agentRole: 'explorer' },
    { title: 'Implement guardian configuration', source: 'cli' },
    { title: 'Guardian', agentRole: 'worker' },
    { source: { subagent: { thread_spawn: { agent_role: 'reviewer' } } } },
    { title: 'User approval', source: 'cli', state: 'waiting_approval', permissionMode: 'guardian-approvals' },
    { source: { source: 'cli', approvalReviewer: 'guardian_subagent' } },
    { source: { arbitraryText: 'guardian_review' } },
    { source: '{broken guardian' },
    {},
  ])('keeps ordinary review agents, user topics and approvals visible: %j', (thread) => {
    expect(isGuardianThread(thread)).toBe(false);
  });
});
