import { BookOpen, Sparkles } from 'lucide-react';
import { useConfig } from '../../providers/ConfigProvider';

export default function WelcomeMessage() {
  const { config } = useConfig();
  
  const welcomeConfig = config?.ui?.welcome || {
    title: '欢迎使用儿童科普绘本生成助手',
    subtitle: '我可以帮您为不同年龄段的儿童生成包含图片和语音的百科类科普绘本',
    instructions: {
      title: '请告诉我',
      items: [
        '对象：想要了解的事物（如：老虎、挖掘机、向日葵）',
        '年龄：目标儿童的年龄段（如：2岁、5岁、8岁）',
        '风格：绘画风格（可选，如：卡通、手绘、写实）',
      ],
    },
    footer: '或者直接点击下方的快捷选项开始！',
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{welcomeConfig.title}</h2>
        <p className="text-muted-foreground">
          {welcomeConfig.subtitle}
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 border border-border rounded-lg bg-muted/50">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {welcomeConfig.instructions.title}：
          </h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-6">
            {welcomeConfig.instructions.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="p-4 border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">
            {welcomeConfig.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
