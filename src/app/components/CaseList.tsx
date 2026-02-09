import { BookOpen } from 'lucide-react';

interface CaseListProps {
  onCaseClick: (caseId: string) => void;
}

const cases = [
  {
    id: 'encyclopedia',
    title: '百科绘本',
    description: '生成包含图片、文字和语音的百科类绘本',
    icon: BookOpen,
  },
];

export default function CaseList({ onCaseClick }: CaseListProps) {
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-foreground">选择案例</h2>
      <p className="text-sm text-muted-foreground mb-8">选择下方案例开始创建您的绘本</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cases.map((caseItem) => {
          const Icon = caseItem.icon;
          return (
            <button
              key={caseItem.id}
              onClick={() => onCaseClick(caseItem.id)}
              className="p-6 border border-border rounded-xl bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="p-4 bg-primary/10 rounded-xl group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2 text-foreground">{caseItem.title}</h3>
                  <p className="text-sm text-muted-foreground">{caseItem.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
