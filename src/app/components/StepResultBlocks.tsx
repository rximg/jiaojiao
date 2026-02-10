import type { StepResult } from '@/types/types';
import DocumentBlock from './DocumentBlock';
import ImageBlock from './ImageBlock';
import AudioBlock from './AudioBlock';

interface StepResultBlocksProps {
  stepResults: StepResult[];
}

export default function StepResultBlocks({ stepResults }: StepResultBlocksProps) {
  if (!stepResults?.length) return null;

  return (
    <div className="mt-2 space-y-2 flex flex-col gap-2">
      {stepResults.map((sr, index) => {
        if (sr.type === 'document') {
          return (
            <DocumentBlock
              key={`doc-${index}`}
              pathOrContent={sr.payload.pathOrContent}
              title={sr.payload.title}
            />
          );
        }
        if (sr.type === 'image') {
          return (
            <ImageBlock
              key={`img-${sr.payload.path}-${index}`}
              path={sr.payload.path}
              prompt={sr.payload.prompt}
            />
          );
        }
        if (sr.type === 'audio') {
          return (
            <AudioBlock
              key={`audio-${sr.payload.path}-${index}`}
              path={sr.payload.path}
              text={sr.payload.text}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
