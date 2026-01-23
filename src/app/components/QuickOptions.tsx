import { Button } from '@/components/ui/button';

interface QuickOptionsProps {
  onOptionClick: (option: string) => void;
}

const quickOptions = [
  '生成3岁森林主题绘本',
  '生成5岁海洋主题绘本',
  '生成4岁动物主题绘本',
  '生成2岁颜色主题绘本',
];

export default function QuickOptions({ onOptionClick }: QuickOptionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {quickOptions.map((option) => (
        <Button
          key={option}
          variant="outline"
          size="sm"
          onClick={() => onOptionClick(option)}
          className="text-xs"
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
