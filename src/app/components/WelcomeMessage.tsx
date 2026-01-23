import { BookOpen, Sparkles } from 'lucide-react';

export default function WelcomeMessage() {
  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <BookOpen className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">欢迎使用百科绘本生成助手</h2>
        <p className="text-muted-foreground">
          我可以帮您生成包含图片、文字和语音的百科类绘本
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 border border-border rounded-lg bg-muted/50">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            请告诉我：
          </h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-6">
            <li>目标年龄（如：3岁）</li>
            <li>主题（如：森林、海洋、动物等）</li>
            <li>风格（如：卡通、写实等）</li>
          </ul>
        </div>

        <div className="p-4 border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">
            或者直接点击下方的快捷选项开始！
          </p>
        </div>
      </div>
    </div>
  );
}
