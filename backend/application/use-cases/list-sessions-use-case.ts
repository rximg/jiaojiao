/**
 * 列出会话用例：返回会话列表并按 updatedAt 倒序，附带 firstMessage、firstImage
 */
import type { SessionRepository } from '#backend/domain/session/repositories/session-repository.js';
import type { ArtifactRepository } from '#backend/domain/workspace/repositories/artifact-repository.js';

export interface SessionListItem {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  prompt?: string;
  firstMessage?: string;
  firstImage?: string;
}

export interface ListSessionsUseCaseResult {
  sessions: SessionListItem[];
}

export interface ListSessionsUseCaseDeps {
  sessionRepo: SessionRepository;
  artifactRepo: ArtifactRepository;
}

export async function listSessionsUseCase(
  deps: ListSessionsUseCaseDeps
): Promise<ListSessionsUseCaseResult> {
  const sessions = await deps.sessionRepo.list();
  const sessionsRaw = await Promise.all(
    sessions.map(async (session): Promise<SessionListItem> => {
      let firstMessage = '';
      let firstImage = '';
      try {
        const messagesContent = await deps.artifactRepo.read(session.sessionId, 'meta/messages.json');
        const messages = JSON.parse(
          typeof messagesContent === 'string' ? messagesContent : messagesContent.toString('utf-8')
        );
        const firstUserMessage = messages.find((msg: { role?: string }) => msg.role === 'user');
        if (firstUserMessage?.content) {
          firstMessage = String(firstUserMessage.content).substring(0, 100);
        }
      } catch {
        // ignore
      }
      try {
        const imageEntries = await deps.artifactRepo.list(session.sessionId, 'images');
        const imageFile = imageEntries.find((e) => /\.(png|jpg|jpeg|gif|webp)$/i.test(e.name));
        if (imageFile) firstImage = imageFile.path;
      } catch {
        // ignore
      }
      const m = session.meta as Record<string, unknown>;
      return {
        sessionId: session.sessionId,
        createdAt: (m.createdAt as string) ?? new Date().toISOString(),
        updatedAt: (m.updatedAt as string) ?? new Date().toISOString(),
        title: m.title as string | undefined,
        prompt: m.prompt as string | undefined,
        firstMessage,
        firstImage,
      };
    })
  );

  sessionsRaw.sort(
    (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
  );

  return { sessions: sessionsRaw };
}
