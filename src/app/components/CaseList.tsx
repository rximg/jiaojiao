import { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';

// 预加载 src/assets/ 下所有图片，key 形如 "/src/assets/行为纠正海报.jpg"
const assetMap = import.meta.glob('@/assets/*.{png,jpg,jpeg,webp}', { eager: true }) as Record<string, { default: string }>;

function getCoverUrl(filename: string | null | undefined): string | undefined {
  if (!filename) return undefined;
  const entry = Object.entries(assetMap).find(([key]) => key.endsWith('/' + filename));
  return entry?.[1]?.default;
}

interface CaseMeta {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  order: number;
}

interface CaseListProps {
  onCaseClick: (caseId: string) => void;
}

export default function CaseList({ onCaseClick }: CaseListProps) {
  const [cases, setCases] = useState<CaseMeta[]>([]);

  useEffect(() => {
    window.electronAPI?.config?.getCases?.().then(setCases).catch(console.error);
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-foreground">选择案例</h2>
      <p className="text-sm text-muted-foreground mb-8">选择下方案例开始创建您的绘本</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {cases.map((caseItem) => {
          const coverUrl = getCoverUrl(caseItem.cover);
          return (
            <button
              key={caseItem.id}
              onClick={() => onCaseClick(caseItem.id)}
              className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 text-left group overflow-hidden"
            >
              {/* 海报区域：放大突出 */}
              <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <BookOpen className="h-16 w-16 text-primary" />
                  </div>
                )}
              </div>
              {/* 标题：海报下方 */}
              <div className="px-5 pt-4 pb-3">
                <h3 className="font-semibold text-lg text-foreground mb-1">{caseItem.title}</h3>
                <p className="text-sm text-muted-foreground">{caseItem.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
