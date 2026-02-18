/**
 * 更新会话用例：更新 meta，可选写 meta/messages.json、meta/todos.json
 */
import type { SessionRepository } from '#backend/domain/session/repositories/session-repository.js';
import type { ArtifactRepository } from '#backend/domain/workspace/repositories/artifact-repository.js';
import type { Session } from '#backend/domain/session/index.js';

export interface SessionMetaUpdate {
  title?: string;
  prompt?: string;
  messages?: any[];
  todos?: any[];
}

export interface UpdateSessionUseCaseResult {
  meta: Session['meta'] & { sessionId: string; updatedAt: string };
}

export interface UpdateSessionUseCaseDeps {
  sessionRepo: SessionRepository;
  artifactRepo: ArtifactRepository;
}

export async function updateSessionUseCase(
  deps: UpdateSessionUseCaseDeps,
  sessionId: string,
  updates: SessionMetaUpdate
): Promise<UpdateSessionUseCaseResult> {
  let session = await deps.sessionRepo.findById(sessionId);
  let meta: Session['meta'] & { sessionId: string; createdAt: string; updatedAt: string };

  if (!session) {
    meta = {
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: updates.title ?? '未命名对话',
      prompt: updates.prompt ?? '',
    };
    await Promise.all([
      deps.artifactRepo.write(sessionId, 'images/.gitkeep', ''),
      deps.artifactRepo.write(sessionId, 'audio/.gitkeep', ''),
      deps.artifactRepo.write(sessionId, 'llm_logs/.gitkeep', ''),
    ]);
  } else {
    meta = {
      ...session.meta,
      sessionId: session.sessionId,
    } as Session['meta'] & { sessionId: string; createdAt: string; updatedAt: string };
  }

  const updatedMeta = {
    ...meta,
    ...updates,
    sessionId,
    updatedAt: new Date().toISOString(),
  };

  await deps.sessionRepo.save({ sessionId, meta: updatedMeta });

  if (updates.messages !== undefined) {
    await deps.artifactRepo.write(
      sessionId,
      'meta/messages.json',
      JSON.stringify(updates.messages, null, 2)
    );
  }
  if (updates.todos !== undefined) {
    await deps.artifactRepo.write(
      sessionId,
      'meta/todos.json',
      JSON.stringify(updates.todos, null, 2)
    );
  }

  return { meta: updatedMeta };
}
