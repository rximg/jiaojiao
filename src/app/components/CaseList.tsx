import { BookOpen } from 'lucide-react';
import coverImage from '@/assets/科普百科海报.png';

interface CaseListProps {
  onCaseClick: (caseId: string) => void;
}

interface CaseItem {
  id: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
  coverImage?: string;
}

const cases: CaseItem[] = [
  {
    id: 'encyclopedia',
    title: '百科绘本',
    description: '生成包含图片、文字和语音的百科类绘本',
    icon: BookOpen,
    coverImage,
  },
];

export default function CaseList({ onCaseClick }: CaseListProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-foreground">选择案例</h2>
      <p className="text-sm text-muted-foreground mb-8">选择下方案例开始创建您的绘本</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {cases.map((caseItem) => {
          const Icon = caseItem.icon;
          return (
            <button
              key={caseItem.id}
              onClick={() => onCaseClick(caseItem.id)}
              className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 text-left group overflow-hidden"
            >
              {/* 海报区域：放大突出 */}
              <div className="aspect-[3/4] w-full overflow-hidden bg-muted">
                {caseItem.coverImage ? (
                  <img
                    src={caseItem.coverImage}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <Icon className="h-16 w-16 text-primary" />
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
