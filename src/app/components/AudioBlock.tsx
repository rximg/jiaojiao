import { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioBlockProps {
  path: string;
  text?: string;
}

export default function AudioBlock({ path, text }: AudioBlockProps) {
  const [playing, setPlaying] = useState(false);
  const audioId = `audio-${path.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const encodedPath = encodeURIComponent(path);

  const togglePlay = () => {
    const el = document.getElementById(audioId) as HTMLAudioElement | null;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border hover:border-primary transition-colors max-w-md">
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 shrink-0"
        onClick={togglePlay}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <audio
        id={audioId}
        src={`local-file://${encodedPath}`}
        className="flex-1 h-8 min-w-0"
        controls
        onEnded={() => setPlaying(false)}
      />
      {text && (
        <div className="text-xs text-muted-foreground truncate max-w-[120px] shrink-0" title={text}>
          {text}
        </div>
      )}
    </div>
  );
}
