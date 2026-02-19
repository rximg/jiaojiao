/**
 * 获取会话详情用例：返回 meta、messages、todos、files（images/audio/llm_logs）
 */
import type { SessionRepository } from '#backend/domain/session/repositories/session-repository.js';
import type { ArtifactRepository, LsEntry } from '#backend/domain/workspace/repositories/artifact-repository.js';

export interface SessionMetaDto {
  sessionId: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  prompt?: string;
  caseId?: string;
}

export interface GetSessionUseCaseResult {
  meta: SessionMetaDto;
  messages: any[];
  todos: any[];
  files: {
    images: LsEntry[];
    audio: LsEntry[];
    llm_logs: LsEntry[];
  };
}

export interface GetSessionUseCaseDeps {
  sessionRepo: SessionRepository;
  artifactRepo: ArtifactRepository;
}

export async function getSessionUseCase(
  deps: GetSessionUseCaseDeps,
  sessionId: string
): Promise<GetSessionUseCaseResult> {
  const session = await deps.sessionRepo.findById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  let messages: any[] = (session.meta as { messages?: any[] }).messages ?? [];
  let todos: any[] = (session.meta as { todos?: any[] }).todos ?? [];

  try {
    const messagesContent = await deps.artifactRepo.read(sessionId, 'meta/messages.json');
    messages = JSON.parse(
      typeof messagesContent === 'string' ? messagesContent : messagesContent.toString('utf-8')
    );
  } catch {
    // ignore
  }

  try {
    const todosContent = await deps.artifactRepo.read(sessionId, 'meta/todos.json');
    todos = JSON.parse(
      typeof todosContent === 'string' ? todosContent : todosContent.toString('utf-8')
    );
  } catch {
    // ignore
  }

  const [images, audio, logs] = await Promise.all([
    deps.artifactRepo.list(sessionId, 'images'),
    deps.artifactRepo.list(sessionId, 'audio'),
    deps.artifactRepo.list(sessionId, 'llm_logs'),
  ]);

  return {
    meta: { ...session.meta, sessionId: session.sessionId } as SessionMetaDto,
    messages,
    todos,
    files: {
      images: images.filter((f) => !f.name.startsWith('.')),
      audio: audio.filter((f) => !f.name.startsWith('.')),
      llm_logs: logs.filter((f) => !f.name.startsWith('.')),
    },
  };
}
