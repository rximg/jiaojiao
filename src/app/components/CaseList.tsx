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
      <h2 className="text-2xl font-bold mb-6">选择案例</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cases.map((caseItem) => {
          const Icon = caseItem.icon;
          return (
            <button
              key={caseItem.id}
              onClick={() => onCaseClick(caseItem.id)}
              className="p-6 border border-border rounded-lg hover:bg-accent transition-colors text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">{caseItem.title}</h3>
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
