import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function TimelinePage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">주간활동현황</h1>
      </div>
      
      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>주간활동현황</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">타임라인 레이아웃 준비중입니다.</p>
        </CardContent>
      </Card>
    </div>
  );
}
