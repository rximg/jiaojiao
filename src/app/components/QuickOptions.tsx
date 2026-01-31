import { Button } from '@/components/ui/button';
import { useConfig } from '../../providers/ConfigProvider';
import type { QuickOption } from '@/types/types';

interface QuickOptionsProps {
  onOptionClick: (option: string) => void;
}

const defaultQuickOptions = [
  { label: '2岁宝宝看的老虎', prompt: '给2岁宝宝生成老虎的绘本', description: '适合低幼儿童' },
  { label: '5岁孩子的挖掘机', prompt: '给5岁孩子生成挖掘机的科普图', description: '工程机械科普' },
  { label: '3岁宝宝的恐龙', prompt: '3岁宝宝看的霸王龙', description: '史前生物探索' },
];

export default function QuickOptions({ onOptionClick }: QuickOptionsProps) {
  const { config } = useConfig();
  
  const quickOptions = config?.ui?.quickOptions || config?.ui?.quick_options || defaultQuickOptions;

  return (
    <div className="flex flex-wrap gap-2">
      {quickOptions.map((option: QuickOption) => (
        <Button
          key={option.label}
          variant="outline"
          size="sm"
          onClick={() => onOptionClick(option.prompt)}
          className="text-xs"
          title={option.description}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
