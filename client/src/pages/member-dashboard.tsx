import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Download, Edit, TrendingUp, TrendingDown, Users, DollarSign, FileText, Target } from "lucide-react";
import { useRoute, Link } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const memberData: Record<string, { name: string; team: string; status: string; lastActivity: string }> = {
  ceo: { name: "대표이사", team: "경영진", status: "active", lastActivity: "2025.01.30" },
  hq: { name: "총괄이사", team: "경영진", status: "active", lastActivity: "2025.01.30" },
  m1: { name: "김민수", team: "경영지원실", status: "active", lastActivity: "2025.01.29" },
  m2: { name: "이영희", team: "경영지원실", status: "active", lastActivity: "2025.01.28" },
  mk1: { name: "박지훈", team: "마케팅팀", status: "active", lastActivity: "2025.01.30" },
  mk2: { name: "최수진", team: "마케팅팀", status: "active", lastActivity: "2025.01.29" },
  mk3: { name: "정우성", team: "마케팅팀", status: "inactive", lastActivity: "2025.01.15" },
  r1: { name: "한소희", team: "타지역팀", status: "active", lastActivity: "2025.01.30" },
  r2: { name: "오세훈", team: "타지역팀", status: "active", lastActivity: "2025.01.28" },
};

const monthlyData = [
  { month: "8월", target: 5000, actual: 4200 },
  { month: "9월", target: 5500, actual: 5100 },
  { month: "10월", target: 6000, actual: 5800 },
  { month: "11월", target: 6500, actual: 6200 },
  { month: "12월", target: 7000, actual: 6800 },
  { month: "1월", target: 7500, actual: 7100 },
];

const productData = [
  { name: "SaaS", value: 45, color: "#135bec" },
  { name: "유지보수", value: 30, color: "#10b981" },
  { name: "컨설팅", value: 25, color: "#f59e0b" },
];

function StatCard({
  title,
  value,
  change,
  icon: Icon,
}: {
  title: string;
  value: string;
  change?: string;
  icon: React.ElementType;
}) {
  const isNegative = change?.startsWith("-");
  
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {change && (
            <span className={`text-sm font-medium flex items-center gap-1 ${isNegative ? "text-red-500" : "text-green-500"}`}>
              {isNegative ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {change}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MemberDashboard() {
  const [, params] = useRoute("/settings/org/member/:id");
  const memberId = params?.id || "unknown";
  const member = memberData[memberId] || { name: "담당자 이름", team: "팀명", status: "-", lastActivity: "-" };

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/settings/org" className="hover:text-primary">팀 성과 Overview</Link>
        <span>/</span>
        <span className="text-foreground font-medium">담당자 상세 성과</span>
      </div>

      {/* Date Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-card border border-border px-4 py-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">2025.01.01 ~ 2025.01.30</span>
        </div>
        <Button className="bg-primary text-white" data-testid="button-search">
          조회
        </Button>
      </div>

      {/* Member Profile Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-muted flex items-center justify-center">
                <span className="text-2xl font-bold text-muted-foreground">{member.name.charAt(0)}</span>
              </div>
              <div className="relative">
                <div className="absolute -left-2 bottom-0 w-3 h-3 bg-green-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-2xl font-bold" data-testid="text-member-name">{member.name}</h2>
                  <Badge variant="outline" className="text-xs">{member.team}</Badge>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  현재 상태: {member.status === "active" ? "활동중" : "비활성"}
                </p>
                <p className="text-sm text-muted-foreground">
                  마지막 활동: {member.lastActivity}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2" data-testid="button-edit-profile">
                <Edit className="w-4 h-4" />
                프로필 수정
              </Button>
              <Button className="bg-primary text-white gap-2" data-testid="button-export-report">
                <Download className="w-4 h-4" />
                보고서 내보내기
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="개인 총 매출" value="--" change="-%"  icon={DollarSign} />
        <StatCard title="계약 달성률" value="--" change="-%"  icon={Target} />
        <StatCard title="신규 고객 발굴" value="--" change="" icon={Users} />
        <StatCard title="평균 계약 단가" value="--" change="-%"  icon={FileText} />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">월별 매출 성장 추이</CardTitle>
                <p className="text-sm text-muted-foreground">최근 6개월 데이터</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-primary" />
                  <span>목표</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-muted" />
                  <span>실적</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${v/1000}K`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))" 
                    }}
                    formatter={(value: number) => [`₩${value.toLocaleString()}만`, ""]}
                  />
                  <Bar dataKey="target" fill="#135bec" name="목표" />
                  <Bar dataKey="actual" fill="#64748b" name="실적" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Product Distribution Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-bold">담당 상품별 매출 비중</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={productData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {productData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))" 
                    }}
                    formatter={(value: number) => [`${value}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {productData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-muted-foreground">{item.name} ({item.value}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
