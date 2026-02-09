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
    <div className="max-w-2xl mx-auto py-10">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-5">
          <BookOpen className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-3 text-foreground">{welcomeConfig.title}</h2>
        <p className="text-muted-foreground text-base">
          {welcomeConfig.subtitle}
        </p>
      </div>

      <div className="space-y-5">
        <div className="p-5 border border-border rounded-xl bg-muted/50 shadow-sm">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {welcomeConfig.instructions.title}：
          </h3>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
            {welcomeConfig.instructions.items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="p-5 border border-border rounded-xl bg-card shadow-sm">
          <p className="text-sm text-muted-foreground">
            {welcomeConfig.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
