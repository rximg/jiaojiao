/**
 * 创建会话用例：创建新会话、初始化运行时与产物目录、写审计日志
 */
import { randomUUID } from 'crypto';
import type { SessionRepository } from '#backend/domain/session/repositories/session-repository.js';
import type { ArtifactRepository } from '#backend/domain/workspace/repositories/artifact-repository.js';
import type { Session } from '#backend/domain/session/index.js';

export interface CreateSessionUseCaseParams {
  title?: string;
  prompt?: string;
  caseId?: string;
}

export interface CreateSessionUseCaseResult {
  sessionId: string;
  meta: { sessionId: string; createdAt: string; updatedAt: string; title?: string; prompt?: string; caseId?: string };
}

export interface CreateSessionUseCaseDeps {
  sessionRepo: SessionRepository;
  artifactRepo: ArtifactRepository;
  createAgentRuntime: (sessionId: string) => Promise<unknown>;
  logAudit: (sessionId: string, payload: Record<string, unknown>) => Promise<void>;
}

export async function createSessionUseCase(
  deps: CreateSessionUseCaseDeps,
  params: CreateSessionUseCaseParams
): Promise<CreateSessionUseCaseResult> {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const meta: Session['meta'] & { sessionId: string; createdAt: string; updatedAt: string } = {
    sessionId,
    createdAt: now,
    updatedAt: now,
    title: params.title ?? '新对话',
    prompt: params.prompt ?? '',
    ...(params.caseId ? { caseId: params.caseId } : {}),
  };

  await deps.createAgentRuntime(sessionId);
  await deps.sessionRepo.save({ sessionId, meta });

  await Promise.all([
    deps.artifactRepo.write(sessionId, 'images/.gitkeep', ''),
    deps.artifactRepo.write(sessionId, 'audio/.gitkeep', ''),
    deps.artifactRepo.write(sessionId, 'checkpoints/.gitkeep', ''),
  ]);

  await deps.logAudit(sessionId, {
    action: 'session_created',
    title: meta.title,
    prompt: meta.prompt,
    caseId: meta.caseId,
  });

  return { sessionId, meta };
}
