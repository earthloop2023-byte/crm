import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CustomCalendar } from "@/components/custom-calendar";
import {
  TrendingUp, TrendingDown, DollarSign, FileText, Target, Users,
  Phone, UserPlus, UserCheck, UserX, Package, Sparkles, CalendarIcon, RotateCcw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { getKoreanDateKey, getKoreanNow, getKoreanEndOfDay } from "@/lib/korean-time";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface PersonalStats {
  isExecutive: boolean;
  user: {
    id: string;
    name: string;
    role: string;
    department: string;
    workStatus: string;
  };
  totalSales: number;
  totalRefunds: number;
  netSales: number;
  contractCount: number;
  avgContractValue: number;
  currentMonthSales: number;
  lastMonthSales: number;
  growthRate: number;
  monthlyRevenue: Array<{
    month: string;
    yearMonth: string;
    매출: number;
    환불: number;
    순매출: number;
    건수: number;
  }>;
  productDistribution: Array<{
    name: string;
    value: number;
    sales: number;
    color: string;
  }>;
  activityCount: number;
}

interface DeptAnalytics {
  summary: {
    totalSales: number;
    totalRefunds: number;
    netSales: number;
    contractCount: number;
    avgDealAmount: number;
    confirmedCount: number;
    confirmRate: number;
  };
  monthlyData: Array<{
    month: string;
    yearMonth: string;
    매출: number;
    환불: number;
    순매출: number;
    건수: number;
  }>;
  productData: Array<{
    name: string;
    value: number;
    sales: number;
    count: number;
    color: string;
  }>;
  marketingProductData: Array<{
    name: string;
    value: number;
    sales: number;
    count: number;
    color: string;
  }>;
  managerData: Array<{
    manager: string;
    매출: number;
    환불: number;
    건수: number;
    작업비: number;
    작업자: string;
  }>;
  dealsSummary: {
    totalLineCount: number;
    newDeals: number;
    activeDeals: number;
    churnedDeals: number;
    newLines: number;
    activeLines: number;
    churnedLines: number;
    totalSlotCount: number;
    viralContractCount: number;
    monthlyAchievementRate: number;
    currentMonthSales: number;
  };
  regionalData: {
    monthlyNewDealsData: Array<{ month: string; yearMonth: string; 신규건수: number }>;
    productLineData: Array<{ name: string; value: number; lines: number; color: string }>;
    managerLineData: Array<{ manager: string; 회선수: number; 신규: number; 유지: number; 해지: number }>;
    productTimelineData: Array<{ dealId: string; productName: string; content: string; authorName: string; createdAt: string }>;
  };
}

const formatAmount = (value: number) => value.toLocaleString();
const formatCurrency = (value: number) => {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000000) return `${(value / 10000000).toFixed(0)}천만`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return value.toLocaleString();
};

const chartTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 0,
  color: "hsl(var(--foreground))"
};

const getCurrentKoreanMonthStart = () => {
  const now = getKoreanNow();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

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
  const isZero = change === "0%" || change === "+0%";

  return (
    <Card className="hover:border-primary transition-colors" data-testid={`stat-card-${title}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold">{value}</span>
          {change && (
            <span className={`text-sm font-medium flex items-center gap-1 ${isZero ? "text-muted-foreground" : isNegative ? "text-red-500" : "text-green-500"}`}>
              {!isZero && (isNegative ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />)}
              {change}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyRevenueChart({ data }: { data: PersonalStats["monthlyRevenue"] }) {
  const sortedData = [...data].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)).slice(-6);
  return (
    <Card data-testid="chart-monthly-revenue">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-bold">월별 매출 추이</CardTitle>
            <p className="text-sm text-muted-foreground">최근 6개월</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">매출 데이터가 없습니다</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sortedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="yearMonth"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(value: string) => `${parseInt(value.split("-")[1])}월`}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={formatCurrency}
              />
              <Tooltip
                formatter={(value: number, name: string) => [`${formatAmount(value)}원`, name]}
                contentStyle={chartTooltipStyle}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                labelFormatter={(label: string) => `${parseInt(label.split("-")[1])}월`}
              />
              <Bar dataKey="매출" fill="#135bec" name="매출" radius={0} />
              <Bar dataKey="순매출" fill="#22c55e" name="순매출" radius={0} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const PRODUCT_PAGE_SIZE = 5;

function ProductDistributionTable({ data, testIdPrefix = "product" }: { data: Array<{ name: string; value: number; sales: number; color: string; count?: number }>; testIdPrefix?: string }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(data.length / PRODUCT_PAGE_SIZE);
  const pagedData = data.slice((page - 1) * PRODUCT_PAGE_SIZE, page * PRODUCT_PAGE_SIZE);

  return (
    <Card data-testid={`chart-${testIdPrefix}-distribution`} className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg font-bold">상품별 매출 비중</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">상품 데이터가 없습니다</div>
        ) : (
          <>
            <div className="flex-1 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-medium whitespace-nowrap">상품</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">매출</TableHead>
                    {pagedData[0]?.count !== undefined && (
                      <TableHead className="text-xs font-medium text-right whitespace-nowrap">건수</TableHead>
                    )}
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">비중</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedData.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20" data-testid={`row-${testIdPrefix}-dist-${idx}`}>
                      <TableCell className="text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3" style={{ backgroundColor: item.color }} />
                          {item.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-right font-bold">{formatAmount(item.sales)}원</TableCell>
                      {item.count !== undefined && (
                        <TableCell className="text-sm text-right">{item.count}건</TableCell>
                      )}
                      <TableCell className="text-sm text-right text-muted-foreground">{item.value}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 mt-auto border-t">
                <span className="text-xs text-muted-foreground">
                  {data.length}개 중 {(page - 1) * PRODUCT_PAGE_SIZE + 1}-{Math.min(page * PRODUCT_PAGE_SIZE, data.length)}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid={`button-${testIdPrefix}-prev`}>이전</Button>
                  <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid={`button-${testIdPrefix}-next`}>다음</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RegionalProductLineTable({ data }: { data: Array<{ name: string; value: number; lines: number; color: string }> }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(data.length / PRODUCT_PAGE_SIZE);
  const pagedData = data.slice((page - 1) * PRODUCT_PAGE_SIZE, page * PRODUCT_PAGE_SIZE);

  return (
    <Card data-testid="chart-regional-product-lines" className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">상품별 회선 비중</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">데이터가 없습니다</div>
        ) : (
          <>
            <div className="flex-1 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-medium whitespace-nowrap">상품</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">회선수</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">비중</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedData.map((item, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20" data-testid={`row-regional-product-${idx}`}>
                      <TableCell className="text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3" style={{ backgroundColor: item.color }} />
                          {item.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-right font-bold">{formatAmount(item.lines)}회선</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{item.value}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 mt-auto border-t">
                <span className="text-xs text-muted-foreground">
                  {data.length}개 중 {(page - 1) * PRODUCT_PAGE_SIZE + 1}-{Math.min(page * PRODUCT_PAGE_SIZE, data.length)}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-regional-product-prev">이전</Button>
                  <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
                  <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid="button-regional-product-next">다음</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MarketingSection({ data }: { data: DeptAnalytics }) {
  const { summary, dealsSummary, monthlyData: rawMonthlyData, marketingProductData, managerData } = data;
  const monthlyData = [...rawMonthlyData].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-6 bg-blue-500" />
        <h2 className="text-lg font-bold" data-testid="text-marketing-title">마케팅팀</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="stat-marketing-sales">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">총 매출</div>
            <div className="text-2xl font-bold mt-1">{formatAmount(summary?.totalSales || 0)}원</div>
            <div className="text-xs text-muted-foreground mt-1">계약 {summary?.contractCount || 0}건</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-marketing-achievement">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="w-4 h-4" />
              월 달성률
            </div>
            <div className="text-2xl font-bold mt-1">{dealsSummary?.monthlyAchievementRate || 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">이번 달 {formatAmount(dealsSummary?.currentMonthSales || 0)}원</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-marketing-slots">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="w-4 h-4" />
              슬롯 수량
            </div>
            <div className="text-2xl font-bold mt-1">{dealsSummary?.totalSlotCount || 0}건</div>
            <div className="text-xs text-muted-foreground mt-1">슬롯 계약 건수</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-marketing-viral">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="w-4 h-4" />
              바이럴 계약건수
            </div>
            <div className="text-2xl font-bold mt-1">{dealsSummary?.viralContractCount || 0}건</div>
            <div className="text-xs text-muted-foreground mt-1">바이럴 상품 계약</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="chart-marketing-monthly">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">월별 매출 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {monthlyData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터가 없습니다</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="yearMonth" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value: string) => `${parseInt(value.split("-")[1])}월`} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={formatCurrency} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) => [`${formatAmount(value)}원`, name]}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      labelFormatter={(label: string) => `${label.split("-")[0]}년 ${parseInt(label.split("-")[1])}월`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="매출" stroke="#135bec" strokeWidth={2} dot={{ fill: "#135bec" }} />
                    <Line type="monotone" dataKey="순매출" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <ProductDistributionTable data={marketingProductData} testIdPrefix="marketing-product" />
      </div>

      <Card data-testid="table-marketing-manager">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">담당자별 매출 현황</CardTitle>
        </CardHeader>
        <CardContent>
          {managerData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">데이터가 없습니다</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-medium whitespace-nowrap">담당자</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">매출</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">환불</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">순매출</TableHead>
                    <TableHead className="text-xs font-medium text-center whitespace-nowrap">건수</TableHead>
                    <TableHead className="text-xs font-medium text-right whitespace-nowrap">작업비</TableHead>
                    <TableHead className="text-xs font-medium whitespace-nowrap">작업자</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managerData.map((m, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20" data-testid={`row-manager-${idx}`}>
                      <TableCell className="text-xs whitespace-nowrap font-medium">{m.manager}</TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">{formatAmount(m.매출)}원</TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap text-red-500">{m.환불 > 0 ? formatAmount(m.환불) + "원" : "-"}</TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap text-emerald-600">{formatAmount(m.매출 - m.환불)}원</TableCell>
                      <TableCell className="text-xs text-center whitespace-nowrap">{m.건수}건</TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">{m.작업비 > 0 ? formatAmount(m.작업비) + "원" : "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{m.작업자 || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RegionalSection({ data }: { data: DeptAnalytics }) {
  const { dealsSummary, regionalData } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-6 bg-emerald-500" />
        <h2 className="text-lg font-bold" data-testid="text-regional-title">타지역팀</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="stat-regional-lines">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="w-4 h-4" />
              총 회선수
            </div>
            <div className="text-2xl font-bold mt-1">{formatAmount(dealsSummary?.totalLineCount || 0)}회선</div>
            <div className="text-xs text-muted-foreground mt-1">전체 등록 회선</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-regional-new">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserPlus className="w-4 h-4 text-blue-500" />
              신규
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-500">{formatAmount(dealsSummary?.newLines || 0)}회선</div>
            <div className="text-xs text-muted-foreground mt-1">신규 등록 ({dealsSummary?.newDeals || 0}건)</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-regional-active">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              유지
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-500">{formatAmount(dealsSummary?.activeLines || 0)}회선</div>
            <div className="text-xs text-muted-foreground mt-1">유지 중 ({dealsSummary?.activeDeals || 0}건)</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-regional-churned">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserX className="w-4 h-4 text-red-500" />
              해지
            </div>
            <div className="text-2xl font-bold mt-1 text-red-500">{formatAmount(dealsSummary?.churnedLines || 0)}회선</div>
            <div className="text-xs text-muted-foreground mt-1">해지 처리 ({dealsSummary?.churnedDeals || 0}건)</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="chart-regional-monthly">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">월별 신규 건수 (최근 3개월)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {(() => {
                const allData = [...(regionalData?.monthlyNewDealsData || [])].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
                const recent3 = allData.slice(-3);
                if (recent3.length === 0) {
                  return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터가 없습니다</div>;
                }
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={recent3}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="yearMonth" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value: string) => `${parseInt(value.split("-")[1])}월`} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value: number) => [`${value}건`, "신규"]}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Bar dataKey="신규건수" fill="#3b82f6" radius={0} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        <RegionalProductLineTable data={regionalData?.productLineData || []} />
      </div>

      <Card data-testid="table-regional-manager">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">담당자별 회선 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-medium whitespace-nowrap">담당자</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">회선수</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">신규</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">유지</TableHead>
                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">해지</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(regionalData?.managerLineData || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-8 text-center text-muted-foreground text-sm">데이터가 없습니다</TableCell>
                  </TableRow>
                ) : (
                  (regionalData?.managerLineData || []).map((row, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20" data-testid={`row-regional-manager-${idx}`}>
                      <TableCell className="text-sm font-medium">{row.manager}</TableCell>
                      <TableCell className="text-sm text-right font-bold">{formatAmount(row.회선수)}</TableCell>
                      <TableCell className="text-sm text-right text-blue-500">{row.신규}</TableCell>
                      <TableCell className="text-sm text-right text-emerald-500">{row.유지}</TableCell>
                      <TableCell className="text-sm text-right text-red-500">{row.해지}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { user: authUser } = useAuth();
  const [startDate, setStartDate] = useState<Date>(() => getCurrentKoreanMonthStart());
  const [endDate, setEndDate] = useState<Date>(() => getKoreanEndOfDay());
  const dateFilterParams = useMemo(
    () => ({
      startDate: getKoreanDateKey(startDate),
      endDate: getKoreanDateKey(endDate),
    }),
    [startDate, endDate],
  );

  const fetchPersonalStats = async () => {
    const queryString = new URLSearchParams(dateFilterParams).toString();
    const res = await fetch(`/api/stats/personal?${queryString}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  };

  const { data: stats, isLoading } = useQuery<PersonalStats>({
    queryKey: ["/api/stats/personal", dateFilterParams],
    queryFn: fetchPersonalStats,
  });

  const isExecutive = stats?.isExecutive || false;

  const fetchDeptAnalytics = async (department: "\uB9C8\uCF00\uD305\uD300" | "\uD0C0\uC9C0\uC5ED\uD300") => {
    const queryString = new URLSearchParams({
      ...dateFilterParams,
      departmentFilter: department,
    }).toString();
    const res = await fetch(`/api/sales-analytics?${queryString}`, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  };

  const { data: marketingData } = useQuery<DeptAnalytics>({
    queryKey: ["/api/sales-analytics", "\uB9C8\uCF00\uD305\uD300", dateFilterParams],
    queryFn: () => fetchDeptAnalytics("\uB9C8\uCF00\uD305\uD300"),
    enabled: isExecutive,
  });

  const { data: regionalData } = useQuery<DeptAnalytics>({
    queryKey: ["/api/sales-analytics", "\uD0C0\uC9C0\uC5ED\uD300", dateFilterParams],
    queryFn: () => fetchDeptAnalytics("\uD0C0\uC9C0\uC5ED\uD300"),
    enabled: isExecutive,
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-20 h-20" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-5 w-5 mb-4" />
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const userName = stats?.user?.name || authUser?.name || "";
  const userDept = stats?.user?.department || "";
  const userRole = stats?.user?.role || "";
  const workStatus = stats?.user?.workStatus || "";
  const normalizedWorkStatus =
    workStatus === "active" || workStatus === "근무중" || workStatus === "근무" || workStatus === "재직"
      ? "재직중"
      : workStatus === "휴직"
        ? "휴직중"
        : workStatus || "-";
  const growthChange = stats?.growthRate !== undefined
    ? (stats.growthRate >= 0 ? `+${stats.growthRate}%` : `${stats.growthRate}%`)
    : undefined;

  return (
    <div className="p-8 space-y-6">
      <Card data-testid="card-profile">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-20 h-20 bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">{userName.charAt(0)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-2xl font-bold" data-testid="text-member-name">{userName}</h2>
                {userDept && <Badge variant="outline" className="text-xs">{userDept}</Badge>}
                {userRole && <Badge variant="secondary" className="text-xs">{userRole}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {isExecutive ? "전체 부서 데이터 조회 중" : `근무상태: ${normalizedWorkStatus}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-none flex-wrap" data-testid="dashboard-date-filter">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-56 justify-start gap-2 rounded-none" data-testid="filter-date-dashboard">
              <CalendarIcon className="w-4 h-4" />
              {format(startDate, "yyyy.MM.dd", { locale: ko })} ~ {format(endDate, "yyyy.MM.dd", { locale: ko })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-none bg-white" align="start">
            <CustomCalendar
              startDate={startDate}
              endDate={endDate}
              onSelectStart={setStartDate}
              onSelectEnd={setEndDate}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto rounded-none"
          onClick={() => {
            setStartDate(getCurrentKoreanMonthStart());
            setEndDate(getKoreanEndOfDay());
          }}
          data-testid="button-reset-dashboard-date"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          기간 초기화
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title={isExecutive ? "전체 총 매출" : "개인 총 매출"}
          value={stats?.totalSales ? `${formatAmount(stats.totalSales)}원` : "--"}
          change={growthChange}
          icon={DollarSign}
        />
        <StatCard
          title={isExecutive ? "전체 계약 건수" : "총 계약 건수"}
          value={stats?.contractCount ? `${stats.contractCount}건` : "--"}
          icon={FileText}
        />
        <StatCard
          title="평균 계약 단가"
          value={stats?.avgContractValue ? `${formatAmount(stats.avgContractValue)}원` : "--"}
          icon={Target}
        />
        <StatCard
          title={isExecutive ? "전체 활동 내역" : "활동 내역"}
          value={stats?.activityCount ? `${stats.activityCount}건` : "--"}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlyRevenueChart data={stats?.monthlyRevenue || []} />
        <ProductDistributionTable data={stats?.productDistribution || []} />
      </div>

      {isExecutive && marketingData && (
        <MarketingSection data={marketingData} />
      )}

      {isExecutive && regionalData && (
        <RegionalSection data={regionalData} />
      )}
    </div>
  );
}
