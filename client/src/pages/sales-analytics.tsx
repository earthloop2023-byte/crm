import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CustomCalendar } from "@/components/custom-calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Filter, Calendar as CalendarIcon, RefreshCw, Phone, UserPlus, UserCheck, UserX, Target, Package, Sparkles, RotateCcw, CircleDollarSign } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Customer, Product, ContractWithFinancials, Deal, RefundWithContract, KeepWithContract } from "@shared/schema";
import { addKoreanBusinessDays, normalizeToKoreanDateOnly } from "@shared/korean-business-days";
import { getKoreanNow, getKoreanEndOfDay, getKoreanDateKey, isWithinKoreanDateRange } from "@/lib/korean-time";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SalesAnalytics {
  isExecutive: boolean;
  userName: string;
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
    작업비: number;
    건수: number;
  }>;
  departmentData: Array<{
    department: string;
    매출: number;
    건수: number;
  }>;
  dealsSummary: {
    totalLineCount: number;
    newDeals: number;
    activeDeals: number;
    churnedDeals: number;
    newLines: number;
    activeLines: number;
    churnedLines: number;
    scheduledDeals?: number;
    scheduledLines?: number;
    registeredDeals?: number;
    registeredLines?: number;
    totalSlotCount: number;
    viralContractCount: number;
    monthlyAchievementRate: number;
    currentMonthSales: number;
  };
  regionalData: {
    summary: {
      totalLineCount: number;
      newDeals: number;
      activeDeals: number;
      changedDeals: number;
      churnedDeals: number;
      newLines: number;
      activeLines: number;
      changedLines: number;
      churnedLines: number;
    };
    monthlyNewDealsData: Array<{ month: string; yearMonth: string; lineCount: number }>;
    monthlyStatusData: Array<{
      yearMonth: string;
      monthLabel: string;
      openLines: number;
      churnLines: number;
      openRate: number;
      churnRate: number;
      openTarget: number;
      churnDefenseTarget: number;
      openAchievementRate: number;
      churnDefenseAchievementRate: number;
      totalLines: number;
      sales?: number;
      managementCost?: number;
      monthlyLines: number;
      churnLineRate: number;
    }>;
    productLineData: Array<{ name: string; value: number; lines: number; color: string }>;
    managerLineData: Array<{ manager: string; 회선수: number; 인입: number; 개통: number; 해지: number }>;
    productTimelineData: Array<{ dealId: string; productName: string; content: string; authorName: string; createdAt: string }>;
  };
}

type RegionalUnpaidMatchedForAnalytics = {
  entries: Array<{
    rowId: string;
    matchedDealId: string | null;
    monthItems: Array<{
      label: string;
      originalAmount: number;
      paidAmount: number;
      remainingAmount: number;
    }>;
    remainingAmount: number;
  }>;
};

const formatCurrency = (value: number) => {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억`;
  }
  if (value >= 10000000) {
    return `${(value / 10000000).toFixed(0)}천만`;
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(0)}만`;
  }
  return value.toLocaleString();
};

const formatAmount = (value: number) => value.toLocaleString();
const REGIONAL_OPEN_TARGET = 10000;
const REGIONAL_CHURN_DEFENSE_TARGET = 3000;
const REGIONAL_MONTHLY_STATUS_VISIBLE_MONTHS = 3;
const REGIONAL_CHURN_RATE_VISIBLE_MONTHS = 3;
const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeProductKey = (value: unknown) => normalizeText(value).replace(/\s+/g, "");
const getBaseProductName = (value: unknown) => normalizeText(value).replace(/\s*\([^)]*\)\s*$/, "").trim();
const getBaseProductKey = (value: unknown) => normalizeProductKey(getBaseProductName(value));
const isRegionalKeyword = (value: unknown) => normalizeText(value).replace(/\s+/g, "").includes("타지역");
const SLOT_PRODUCT_ALIAS_KEYS = new Set(
  [
    "포유",
    "bbs쿠팡",
    "스티젠",
    "프라다",
    "가드",
    "베라",
    "소보루플러스",
    "dex",
    "deep",
    "자몽",
    "루나",
    "엘릭서",
    "피코",
    "말차트래픽",
    "블렌딩",
    "일루마",
    "엘리트",
    "삿포로",
    "플레이스트래픽",
    "언더더딜트래픽",
    "스캔들",
    "랭크업",
    "블루",
    "네이버자동완성",
    "토마토",
    "웹사이트상위",
    "바이럴m총판",
    "아담",
    "자동완성슬롯",
    "포유플레이스",
    "라칸트래픽",
    "앤드류트래픽",
    "웹사이트월보장",
    "플레이스월보장",
    "top",
    "갤럭시",
    "큐랭",
    "1219",
    "웹사이트슬롯",
    "웹사이트트래픽",
    "삿포로트래픽",
    "메리트자완",
    "탑인",
    "헤르메스",
    "보스",
    "뮤즈",
    "네이버함찾",
    "상품찜",
    "커뮤니티침투",
    "인기글월보장",
    "마멘토월간인기글",
  ].map((value) => normalizeProductKey(value)),
);
const VIRAL_PRODUCT_ALIAS_KEYS = new Set(
  [
    "제작영수증리뷰",
    "가구매리뷰",
    "가구매리뷰실배송",
    "가구매리뷰자사몰",
    "가구매리뷰카카오",
    "가구매리뷰옥션",
    "가구매리뷰g마켓",
    "가구매리뷰앱",
    "페이백대행",
    "ai블로그배포",
    "구글플레이스리뷰",
    "카카오맵리뷰",
    "영수증리뷰",
    "준최블배포",
    "예약자리뷰",
    "원고대행",
    "최블배포",
    "언론송출",
    "카페배포",
    "브랜드블로그",
    "브랜드블로그프리미엄",
    "바비톡상담",
    "브랜드인스타",
    "기자단",
    "블로그리뷰",
    "지식인추천좋아요",
    "지식인건바이",
    "체험단",
    "블로그체험단",
    "인스타체험단",
    "촬영단",
    "리뷰",
    "모두닥리뷰",
    "다알려드림지수플",
    "마멘토인기글",
    "인포그래픽",
    "당근후기",
  ].map((value) => normalizeProductKey(value)),
);
const regionalMonthlyTableClass = "w-full min-w-[1080px]";
const regionalMonthlyHeadClass = "h-12 px-3 text-xs font-semibold text-center align-middle whitespace-nowrap";
const regionalMonthlyLabelCellClass = "h-12 px-3 text-sm text-center align-middle whitespace-nowrap";
const regionalMonthlyValueCellClass = "h-12 px-3 text-sm text-center align-middle whitespace-nowrap tabular-nums";
const regionalMonthlyEmphasisCellClass = `${regionalMonthlyValueCellClass} font-semibold`;
const getEffectiveSalesAmount = (contract: Pick<ContractWithFinancials, "cost" | "totalKeep">) =>
  (Number(contract.cost) || 0) - Math.max(0, Number(contract.totalKeep) || 0);
const getGrossSalesAmount = (contract: Pick<ContractWithFinancials, "cost" | "totalRefund">) =>
  (Number(contract.cost) || 0) + Math.max(0, Number(contract.totalRefund) || 0);

type ContractProductDetailForAnalytics = {
  productName?: string | null;
  days?: number | null;
  addQuantity?: number | null;
  extendQuantity?: number | null;
  quantity?: number | null;
};

const parseContractProductDetailsForAnalytics = (rawValue: unknown): ContractProductDetailForAnalytics[] => {
  if (typeof rawValue !== "string" || !rawValue.trim()) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        productName: typeof item.productName === "string" ? item.productName : null,
        days: Number(item.days) || 0,
        addQuantity: Number(item.addQuantity) || 0,
        extendQuantity: Number(item.extendQuantity) || 0,
        quantity: Number(item.quantity) || 0,
      }))
      .filter((item) => normalizeText(item.productName));
  } catch {
    return [];
  }
};

const getCurrentKoreanMonthStart = () => {
  const now = getKoreanNow();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export default function SalesAnalyticsPage() {
  const { user: authUser } = useAuth();
  const [startDate, setStartDate] = useState(() => getCurrentKoreanMonthStart());
  const [endDate, setEndDate] = useState(() => getKoreanEndOfDay());
  const [productFilter, setProductFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [marketingTrendYear, setMarketingTrendYear] = useState(String(getKoreanNow().getFullYear()));
  const [productSalesPage, setProductSalesPage] = useState(1);
  const PRODUCT_SALES_PER_PAGE = 5;
  const [contractPage, setContractPage] = useState(1);
  const CONTRACTS_PER_PAGE = 30;

  const isExecutive = authUser?.role === "대표이사" || authUser?.role === "총괄이사" || authUser?.role === "개발자";
  const userDepartment = authUser?.department;
  const isDeptLocked = !isExecutive && (userDepartment === "마케팅팀" || userDepartment === "타지역팀");

  useEffect(() => {
    if (isDeptLocked && userDepartment) {
      setDepartmentFilter(userDepartment);
    }
  }, [isDeptLocked, userDepartment]);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const showMarketingContractDetails = departmentFilter !== "타지역팀";
  const { data: contractsData = [] } = useQuery<ContractWithFinancials[]>({
    queryKey: ["/api/contracts-with-financials"],
    enabled: showMarketingContractDetails,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch("/api/contracts-with-financials", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const { data: dealsData = [] } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async () => {
      const res = await fetch("/api/deals", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const { data: refundsData = [] } = useQuery<RefundWithContract[]>({
    queryKey: ["/api/refunds"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async () => {
      const res = await fetch("/api/refunds", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const { data: keepsData = [] } = useQuery<KeepWithContract[]>({
    queryKey: ["/api/keeps"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async () => {
      const res = await fetch("/api/keeps", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
  const { data: regionalUnpaidMatchedData = { entries: [] } } = useQuery<RegionalUnpaidMatchedForAnalytics>({
    queryKey: ["/api/regional-unpaids?matchedOnly=true", "sales-analytics"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async () => {
      const res = await fetch("/api/regional-unpaids?matchedOnly=true", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return { entries: [] };
      return res.json();
    },
  });

  const departments = ["마케팅팀", "타지역팀"];

  const regionalProductNameSet = useMemo(() => {
    return new Set(
      products
        .filter((product) => isRegionalKeyword(product.category) || isRegionalKeyword(product.name))
        .map((product) => normalizeText(product.name))
        .filter(Boolean),
    );
  }, [products]);

  const parseContractProductNames = (value: string | null | undefined) => {
    return String(value || "")
      .split(",")
      .map((name) => normalizeText(name))
      .filter(Boolean);
  };

  const getContractAnalyticsProductNames = (
    contract: Pick<ContractWithFinancials, "products" | "productDetailsJson">,
  ) => {
    const detailProductNames = parseContractProductDetailsForAnalytics(contract.productDetailsJson)
      .map((item) => normalizeText(item.productName))
      .filter(Boolean);
    return Array.from(new Set([...detailProductNames, ...parseContractProductNames(contract.products)]));
  };

  const hasSlotContractNumberHint = (contract: Pick<ContractWithFinancials, "contractNumber">) => {
    const contractNumber = normalizeText(contract.contractNumber).toUpperCase();
    return contractNumber.includes("SLOT") || contractNumber.includes("SLT");
  };

  const hasViralContractNumberHint = (contract: Pick<ContractWithFinancials, "contractNumber">) => {
    const contractNumber = normalizeText(contract.contractNumber).toUpperCase();
    return contractNumber.includes("VIRAL");
  };

  const getKeepAnalyticsDate = (keep: KeepWithContract) => keep.createdAt || keep.keepDate;
  const getKeepAnalyticsAmount = (keep: KeepWithContract) => {
    const targetAmount = Math.max(Number(keep.targetAmount) || 0, 0);
    if (targetAmount > 0) return targetAmount;
    return Math.max(Math.abs(Number(keep.amount) || 0), 0);
  };

  const contractHasProduct = (value: string | null | undefined, targetName: string) => {
    const normalizedTarget = normalizeText(targetName);
    if (!normalizedTarget) return false;
    return parseContractProductNames(value).includes(normalizedTarget);
  };

  const contractHasRegionalProduct = (value: string | null | undefined) => {
    const productNames = parseContractProductNames(value);
    return productNames.some((name) => regionalProductNameSet.has(name) || isRegionalKeyword(name));
  };

  const filterParams = {
    startDate: getKoreanDateKey(startDate),
    endDate: getKoreanDateKey(endDate),
    managerName: managerFilter,
    customerName: customerFilter,
    productFilter,
    departmentFilter,
  };

  const { data: analytics, isLoading } = useQuery<SalesAnalytics>({
    queryKey: ["/api/sales-analytics", filterParams],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
    queryFn: async ({ queryKey }) => {
      const [, params] = queryKey as [string, Record<string, string>];
      const queryString = new URLSearchParams(params).toString();
      const res = await fetch(`/api/sales-analytics?${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  useEffect(() => {
    setProductSalesPage(1);
    setContractPage(1);
  }, [startDate, endDate, productFilter, managerFilter, customerFilter, departmentFilter]);

  const handleReset = () => {
    setStartDate(getCurrentKoreanMonthStart());
    setEndDate(getKoreanEndOfDay());
    setProductFilter("all");
    setManagerFilter("all");
    setCustomerFilter("all");
    setContractPage(1);
    if (!isDeptLocked) {
      setDepartmentFilter("all");
    }
  };

  const dealsSummary = analytics?.dealsSummary;
  const productData = analytics?.productData || [];
  const marketingProductData = analytics?.marketingProductData || [];
  const managerData = analytics?.managerData || [];
  const departmentData = analytics?.departmentData || [];
  const regionalData = analytics?.regionalData;

  const isMarketing = departmentFilter === "마케팅팀";
  const isRegional = departmentFilter === "타지역팀";
  const regionalSummary = regionalData?.summary || (isRegional ? dealsSummary : undefined);

  const matchesContractFilters = (
    contract: ContractWithFinancials,
    options?: { ignoreDate?: boolean },
  ) => {
    if (!options?.ignoreDate && !isWithinKoreanDateRange(contract.contractDate, startDate, endDate)) return false;
    if (managerFilter !== "all" && normalizeText(contract.managerName) !== normalizeText(managerFilter)) return false;
    if (customerFilter !== "all" && normalizeText(contract.customerName) !== normalizeText(customerFilter)) return false;
    if (productFilter !== "all" && !contractHasProduct(contract.products, productFilter)) return false;
    if (departmentFilter === "타지역팀" && !contractHasRegionalProduct(contract.products)) return false;
    if (departmentFilter === "마케팅팀" && contractHasRegionalProduct(contract.products)) return false;
    if (!isExecutive && userDepartment === "타지역팀" && !contractHasRegionalProduct(contract.products)) return false;
    if (!isExecutive && userDepartment === "마케팅팀" && contractHasRegionalProduct(contract.products)) return false;
    return true;
  };

  const filteredContracts = useMemo(() => {
    if (!showMarketingContractDetails) return [];
    return contractsData.filter((contract) => matchesContractFilters(contract));
  }, [contractsData, startDate, endDate, managerFilter, customerFilter, productFilter, departmentFilter, regionalProductNameSet, isExecutive, userDepartment, showMarketingContractDetails]);

  const filteredContractsIgnoringDate = useMemo(() => {
    if (!showMarketingContractDetails) return [];
    return contractsData.filter((contract) => matchesContractFilters(contract, { ignoreDate: true }));
  }, [contractsData, managerFilter, customerFilter, productFilter, departmentFilter, regionalProductNameSet, isExecutive, userDepartment, showMarketingContractDetails]);

  const productById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product] as const)),
    [products],
  );
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [String(customer.id), customer] as const)),
    [customers],
  );
  const regionalProductIdSet = useMemo(
    () =>
      new Set(
        products
          .filter((product) => isRegionalKeyword(product.category) || isRegionalKeyword(product.name))
          .map((product) => String(product.id)),
      ),
    [products],
  );

  const filteredMarketingContracts = useMemo(
    () => filteredContracts.filter((contract) => !contractHasRegionalProduct(contract.products)),
    [filteredContracts],
  );

  const productByName = useMemo(
    () =>
      new Map(
        products
          .filter((product) => product.name)
          .map((product) => [normalizeText(product.name), product] as const),
      ),
    [products],
  );
  const productByBaseName = useMemo(
    () =>
      new Map(
        products
          .filter((product) => product.name)
          .map((product) => [getBaseProductKey(product.name), product] as const)
          .filter(([name]) => !!name),
      ),
    [products],
  );
  const resolveAnalyticsProduct = (productName: string) => {
    const exactMatch = productByName.get(normalizeText(productName));
    if (exactMatch) return exactMatch;
    return productByBaseName.get(getBaseProductKey(productName));
  };
  const isSlotLikeProduct = (productName: string) => {
    const matchedProduct = resolveAnalyticsProduct(productName);
    const category = normalizeProductKey(matchedProduct?.category);
    const name = normalizeProductKey(matchedProduct?.name || productName);
    const baseKey = getBaseProductKey(matchedProduct?.name || productName);
    return (
      category.includes("슬롯") ||
      name.includes("슬롯") ||
      SLOT_PRODUCT_ALIAS_KEYS.has(baseKey) ||
      SLOT_PRODUCT_ALIAS_KEYS.has(name)
    );
  };
  const isViralLikeProduct = (productName: string) => {
    const matchedProduct = resolveAnalyticsProduct(productName);
    const category = normalizeProductKey(matchedProduct?.category);
    const name = normalizeProductKey(matchedProduct?.name || productName);
    const baseKey = getBaseProductKey(matchedProduct?.name || productName);
    return (
      category.includes("바이럴") ||
      VIRAL_PRODUCT_ALIAS_KEYS.has(baseKey) ||
      VIRAL_PRODUCT_ALIAS_KEYS.has(name)
    );
  };
  const getContractAnalyticsWorkCost = (contract: ContractWithFinancials) =>
    Number(contract.workCost || 0);

  const marketingContractSummarySource = useMemo(() => {
    if (departmentFilter === "마케팅팀") return filteredContracts;
    if (departmentFilter === "타지역팀") return [];
    return filteredMarketingContracts;
  }, [departmentFilter, filteredContracts, filteredMarketingContracts]);

  const marketingYearTrendSource = useMemo(() => {
    if (departmentFilter === "마케팅팀") return filteredContractsIgnoringDate;
    if (departmentFilter === "타지역팀") return [];
    return filteredContractsIgnoringDate.filter((contract) => !contractHasRegionalProduct(contract.products));
  }, [departmentFilter, filteredContractsIgnoringDate]);

  const marketingRefundMatchesFilters = (
    refund: RefundWithContract,
    options?: { ignoreDate?: boolean },
  ) => {
    if (!options?.ignoreDate && !isWithinKoreanDateRange(refund.refundDate, startDate, endDate)) return false;
    if (managerFilter !== "all" && normalizeText(refund.managerName) !== normalizeText(managerFilter)) return false;
    if (customerFilter !== "all" && normalizeText(refund.customerName) !== normalizeText(customerFilter)) return false;

    const refundProductNames = [
      normalizeText(refund.productName),
      ...parseContractProductNames(refund.products),
    ].filter(Boolean);

    if (
      productFilter !== "all" &&
      !refundProductNames.some((productName) => normalizeText(productName) === normalizeText(productFilter))
    ) {
      return false;
    }

    const isRegionalRefund = refundProductNames.some((productName) => contractHasRegionalProduct(productName));
    if (departmentFilter === "타지역팀" && !isRegionalRefund) return false;
    if (departmentFilter === "마케팅팀" && isRegionalRefund) return false;
    if (!isExecutive && userDepartment === "타지역팀" && !isRegionalRefund) return false;
    if (!isExecutive && userDepartment === "마케팅팀" && isRegionalRefund) return false;
    return true;
  };

  const marketingKeepMatchesFilters = (
    keep: KeepWithContract,
    options?: { ignoreDate?: boolean },
  ) => {
    const applicationDate = getKeepAnalyticsDate(keep);
    if (!options?.ignoreDate && !isWithinKoreanDateRange(applicationDate, startDate, endDate)) return false;
    if (managerFilter !== "all" && normalizeText(keep.managerName) !== normalizeText(managerFilter)) return false;
    if (customerFilter !== "all" && normalizeText(keep.customerName) !== normalizeText(customerFilter)) return false;

    const keepProductNames = [
      normalizeText(keep.productName),
      ...parseContractProductNames(keep.products),
    ].filter(Boolean);

    if (
      productFilter !== "all" &&
      !keepProductNames.some((productName) => normalizeText(productName) === normalizeText(productFilter))
    ) {
      return false;
    }

    const isRegionalKeep = keepProductNames.some((productName) => contractHasRegionalProduct(productName));
    if (departmentFilter === "타지역팀" && !isRegionalKeep) return false;
    if (departmentFilter === "마케팅팀" && isRegionalKeep) return false;
    if (!isExecutive && userDepartment === "타지역팀" && !isRegionalKeep) return false;
    if (!isExecutive && userDepartment === "마케팅팀" && isRegionalKeep) return false;
    return true;
  };

  const marketingRefundSummarySource = useMemo(
    () => refundsData.filter((refund) => marketingRefundMatchesFilters(refund)),
    [refundsData, startDate, endDate, managerFilter, customerFilter, productFilter, departmentFilter, isExecutive, userDepartment],
  );

  const marketingRefundYearSource = useMemo(
    () => refundsData.filter((refund) => marketingRefundMatchesFilters(refund, { ignoreDate: true })),
    [refundsData, managerFilter, customerFilter, productFilter, departmentFilter, isExecutive, userDepartment],
  );

  const marketingKeepSummarySource = useMemo(
    () => keepsData.filter((keep) => marketingKeepMatchesFilters(keep)),
    [keepsData, startDate, endDate, managerFilter, customerFilter, productFilter, departmentFilter, isExecutive, userDepartment],
  );

  const marketingKeepYearSource = useMemo(
    () => keepsData.filter((keep) => marketingKeepMatchesFilters(keep, { ignoreDate: true })),
    [keepsData, managerFilter, customerFilter, productFilter, departmentFilter, isExecutive, userDepartment],
  );

  const marketingTrendYearOptions = useMemo(() => {
    const yearSet = new Set<number>();
    marketingYearTrendSource.forEach((contract) => {
      const year = new Date(contract.contractDate).getFullYear();
      if (Number.isFinite(year)) yearSet.add(year);
    });
    marketingRefundYearSource.forEach((refund) => {
      const year = new Date(refund.refundDate).getFullYear();
      if (Number.isFinite(year)) yearSet.add(year);
    });
    marketingKeepYearSource.forEach((keep) => {
      const applicationDate = getKeepAnalyticsDate(keep);
      const year = new Date(applicationDate).getFullYear();
      if (Number.isFinite(year)) yearSet.add(year);
    });
    if (yearSet.size === 0) yearSet.add(getKoreanNow().getFullYear());
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [marketingYearTrendSource, marketingRefundYearSource, marketingKeepYearSource]);

  useEffect(() => {
    if (!marketingTrendYearOptions.includes(Number(marketingTrendYear))) {
      setMarketingTrendYear(String(marketingTrendYearOptions[0]));
    }
  }, [marketingTrendYear, marketingTrendYearOptions]);

  const marketingTrendData = useMemo(() => {
    const targetYear = Number(marketingTrendYear) || getKoreanNow().getFullYear();
    const monthKeys = Array.from({ length: 12 }, (_, index) =>
      `${targetYear}-${String(index + 1).padStart(2, "0")}`,
    );
    const monthlyMap = new Map(
      monthKeys.map((key) => [
        key,
        {
          sales: 0,
          workCost: 0,
          refunds: 0,
          count: 0,
        },
      ]),
    );

    marketingYearTrendSource.forEach((contract) => {
      const dateKey = getKoreanDateKey(contract.contractDate);
      if (!dateKey) return;
      const yearMonthKey = dateKey.slice(0, 7);
      const bucket = monthlyMap.get(yearMonthKey);
      if (!bucket) return;
      bucket.sales += getGrossSalesAmount(contract);
      bucket.workCost += getContractAnalyticsWorkCost(contract);
      bucket.count += 1;
    });

    marketingRefundYearSource.forEach((refund) => {
      const dateKey = getKoreanDateKey(refund.refundDate);
      if (!dateKey) return;
      const yearMonthKey = dateKey.slice(0, 7);
      const bucket = monthlyMap.get(yearMonthKey);
      if (!bucket) return;
      bucket.refunds += Math.max(Number(refund.amount) || 0, 0);
    });

    marketingKeepYearSource.forEach((keep) => {
      const dateKey = getKoreanDateKey(getKeepAnalyticsDate(keep));
      if (!dateKey) return;
      const yearMonthKey = dateKey.slice(0, 7);
      const bucket = monthlyMap.get(yearMonthKey);
      if (!bucket) return;
      bucket.refunds += getKeepAnalyticsAmount(keep);
    });

    return monthKeys.map((key) => {
      const bucket = monthlyMap.get(key) || { sales: 0, workCost: 0, refunds: 0, count: 0 };
      return {
        month: `${parseInt(key.split("-")[1] || "0", 10)}월`,
        yearMonth: key,
        매출: bucket.sales,
        작업비: bucket.workCost,
        환불: bucket.refunds,
        건수: bucket.count,
      };
    });
  }, [marketingTrendYear, marketingYearTrendSource, marketingRefundYearSource, marketingKeepYearSource]);

  const marketingTotalSales = useMemo(
    () => marketingContractSummarySource.reduce((sum, contract) => sum + getGrossSalesAmount(contract), 0),
    [marketingContractSummarySource],
  );

  const marketingTotalRefunds = useMemo(
    () =>
      marketingRefundSummarySource.reduce((sum, refund) => sum + Math.max(Number(refund.amount) || 0, 0), 0) +
      marketingKeepSummarySource.reduce((sum, keep) => sum + getKeepAnalyticsAmount(keep), 0),
    [marketingRefundSummarySource, marketingKeepSummarySource],
  );

  const marketingTotalWorkCost = useMemo(
    () => marketingContractSummarySource.reduce((sum, contract) => sum + getContractAnalyticsWorkCost(contract), 0),
    [marketingContractSummarySource],
  );

  const marketingNetProfit = marketingTotalSales - marketingTotalRefunds - marketingTotalWorkCost;
  const managerChartHeight = Math.max(280, managerData.length * 44);

  const marketingSlotContractCount = useMemo(
    () =>
      marketingContractSummarySource.filter((contract) => {
        if (hasSlotContractNumberHint(contract)) return true;
        return getContractAnalyticsProductNames(contract).some((productName) => isSlotLikeProduct(productName));
      }).length,
    [marketingContractSummarySource, productByName, productByBaseName],
  );

  const marketingViralContractCount = useMemo(
    () =>
      marketingContractSummarySource.filter((contract) => {
        if (hasViralContractNumberHint(contract)) return true;
        return getContractAnalyticsProductNames(contract).some((productName) => isViralLikeProduct(productName));
      }).length,
    [marketingContractSummarySource, productByName, productByBaseName],
  );

  const marketingSlotOrderDays = useMemo(
    () =>
      marketingContractSummarySource.reduce((sum, contract) => {
        const detailItems = parseContractProductDetailsForAnalytics(contract.productDetailsJson);
        const hasSlotHint = hasSlotContractNumberHint(contract);
        if (detailItems.length > 0) {
          return (
            sum +
              detailItems.reduce((detailSum, item) => {
                if (!hasSlotHint && !isSlotLikeProduct(String(item.productName || ""))) return detailSum;
                const days = Math.max(Number(item.days) || 0, 0);
                const addQuantity = Math.max(Number(item.addQuantity) || 0, 0);
                const extendQuantity = Math.max(Number(item.extendQuantity) || 0, 0);
                return detailSum + days + addQuantity + extendQuantity;
              }, 0)
          );
        }

        const hasSlotProduct =
          hasSlotHint ||
          getContractAnalyticsProductNames(contract).some((productName) => isSlotLikeProduct(productName));
        if (!hasSlotProduct) return sum;

        const days = Math.max(Number(contract.days) || 0, 0);
        const addQuantity = Math.max(Number(contract.addQuantity) || 0, 0);
        const extendQuantity = Math.max(Number(contract.extendQuantity) || 0, 0);
        return sum + days + addQuantity + extendQuantity;
      }, 0),
    [marketingContractSummarySource, productByName, productByBaseName],
  );

  const allRegionalDeals = useMemo(() => {
    return dealsData.filter((deal) => {
      const product = productById.get(String(deal.productId || ""));
      const customer = customerById.get(String(deal.customerId || ""));
      const normalizedDealStatus = normalizeText(deal.contractStatus);
      const hasRegionalBusinessKey =
        !!normalizeText(deal.billingAccountNumber) ||
        !!normalizeText(deal.companyName);
      const hasRegionalLineData =
        Math.max(Number(deal.lineCount) || 0, 0) > 0 ||
        Math.max(Number(deal.cancelledLineCount) || 0, 0) > 0;
      const isRegionalDeal =
        regionalProductIdSet.has(String(deal.productId || "")) ||
        isRegionalKeyword(product?.category) ||
        isRegionalKeyword(product?.name) ||
        (
          (normalizedDealStatus === "인입" ||
            normalizedDealStatus === "신규" ||
            normalizedDealStatus === "신규상담" ||
            normalizedDealStatus === "등록/갱신예정" ||
            normalizedDealStatus === "개통" ||
            normalizedDealStatus === "등록" ||
            normalizedDealStatus === "유지" ||
            normalizedDealStatus === "해지") &&
          (hasRegionalBusinessKey || hasRegionalLineData)
        );

      if (!isRegionalDeal) return false;
      if (managerFilter !== "all" && normalizeText(deal.salesperson) !== normalizeText(managerFilter)) return false;
      if (customerFilter !== "all" && normalizeText(customer?.name) !== normalizeText(customerFilter)) return false;
      if (productFilter !== "all" && normalizeText(product?.name) !== normalizeText(productFilter)) return false;
      return true;
    });
  }, [
    dealsData,
    productById,
    customerById,
    regionalProductIdSet,
    managerFilter,
    customerFilter,
    productFilter,
  ]);

  const formatRate = (value: number, withSign = false) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const sign = withSign && safeValue > 0 ? "+" : "";
    return `${sign}${safeValue.toFixed(1)}%`;
  };
  const formatAmountOrDash = (value: number) => (value === 0 ? "-" : `${formatAmount(value)}원`);

  const toYearMonthKey = (value: Date | string | null | undefined) => {
    if (!value) return null;
    const dateKey = getKoreanDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : null;
  };

  const normalizeDealContractStatus = (deal: Deal) => {
    const normalized = normalizeText(deal.contractStatus);
    if (normalized === "인입" || normalized === "신규" || normalized === "신규상담" || normalized === "등록/갱신예정") return "인입";
    if (normalized === "개통" || normalized === "등록" || normalized === "유지") return "개통";
    if (normalized === "해지") return "해지";
    if (deal.stage === "churned") return "해지";
    if (deal.stage === "active") return "개통";
    return "인입";
  };

  const normalizeRegionalDealDate = (value: Date | string | null | undefined) => {
    const normalized = normalizeToKoreanDateOnly(value);
    if (!normalized) return null;
    if (normalized.getUTCFullYear() < 2000) return null;
    return normalized;
  };

  const addDaysToDate = (value: Date | string | null | undefined, dayDelta: number) => {
    return normalizeRegionalDealDate(addKoreanBusinessDays(value, dayDelta));
  };

  const getRegionalDealOpenDate = (deal: Deal) =>
    normalizeRegionalDealDate(deal.contractEndDate) ??
    addDaysToDate(deal.contractStartDate, 1) ??
    normalizeRegionalDealDate(deal.contractStartDate) ??
    normalizeRegionalDealDate(deal.inboundDate) ??
    normalizeRegionalDealDate(deal.createdAt);

  const getDealChurnLineCount = (deal: Deal) => {
    const lineCount = Math.max(Number(deal.lineCount) || 0, 0);
    const cancelledLineCount = Math.max(Number(deal.cancelledLineCount) || 0, 0);
    const stageChurnLines = deal.stage === "churned" ? Math.max(lineCount - cancelledLineCount, 0) : 0;
    return cancelledLineCount + stageChurnLines;
  };

  const computeChangePercentValue = (current: number, previous: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const monthKeysInRange = useMemo(() => {
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const minDate = new Date(Math.min(startMs, endMs));
    const maxDate = new Date(Math.max(startMs, endMs));
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const stop = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    const keys: string[] = [];

    while (cursor <= stop && keys.length < 120) {
      keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    if (keys.length === 0) {
      const fallback = toYearMonthKey(new Date());
      return fallback ? [fallback] : [];
    }
    return keys;
  }, [startDate, endDate]);

  const regionalReceivablesByMonth = useMemo(() => {
    const monthlyStatusKeys =
      (regionalData?.monthlyStatusData || [])
        .map((row) => row.yearMonth)
        .filter(Boolean);
    const baseKeys = monthlyStatusKeys.length > 0 ? monthlyStatusKeys : monthKeysInRange;
    const map = new Map<string, number>();
    baseKeys.forEach((key) => map.set(key, 0));

    (regionalUnpaidMatchedData.entries || []).forEach((entry) => {
      (entry.monthItems || []).forEach((monthItem) => {
        const normalizedLabel = normalizeText(monthItem.label).replace(/[./]/g, "-");
        if (!/^\d{4}-\d{2}$/.test(normalizedLabel)) return;
        if (!map.has(normalizedLabel)) return;
        const amount = Math.max(Number(monthItem.remainingAmount) || 0, 0);
        map.set(normalizedLabel, (map.get(normalizedLabel) || 0) + amount);
      });
    });

    return map;
  }, [regionalData?.monthlyStatusData, monthKeysInRange, regionalUnpaidMatchedData.entries]);

  type RegionalMonthlyStatusRow = {
    yearMonth: string;
    monthLabel: string;
    openLines: number;
    churnLines: number;
    openRate: number;
    churnRate: number;
    openTarget: number;
    churnDefenseTarget: number;
    openAchievementRate: number;
    churnDefenseAchievementRate: number;
    totalLines: number;
    monthlyLines: number;
    churnLineRate: number;
    sales: number;
    receivables: number;
    managementCost: number;
    operatingProfit: number;
    operatingProfitChangeRate: number;
  };

  const regionalMonthlyStatusRows = useMemo<RegionalMonthlyStatusRow[]>(() => {
    const serverRows = regionalData?.monthlyStatusData || [];
    if (serverRows.length > 0) {
      const rowsWithFinance = serverRows.map((row) => {
        const receivables = regionalReceivablesByMonth.get(row.yearMonth) || 0;
        const sales = Math.max(Number(row.sales ?? row.totalLines * 500) || 0, 0);
        const managementCost = Math.max(Number(row.managementCost) || 0, 0);
        const operatingProfit = sales - receivables - managementCost;

        return {
          ...row,
          sales,
          receivables,
          managementCost,
          operatingProfit,
          operatingProfitChangeRate: 0,
        };
      });

      return rowsWithFinance.map((row, index) => {
        if (index === 0) {
          return row;
        }
        const previous = rowsWithFinance[index - 1];
        return {
          ...row,
          operatingProfitChangeRate: computeChangePercentValue(row.operatingProfit, previous.operatingProfit),
        };
      });
    }

    if (monthKeysInRange.length === 0) return [];

    const firstMonthKey = monthKeysInRange[0];
    const openLinesMap = new Map<string, number>();
    const churnLinesMap = new Map<string, number>();
    monthKeysInRange.forEach((key) => {
      openLinesMap.set(key, 0);
      churnLinesMap.set(key, 0);
    });

    let openingLines = 0;

    allRegionalDeals.forEach((deal) => {
      const lineCount = Math.max(Number(deal.lineCount) || 0, 0);
      const churnLines = getDealChurnLineCount(deal);
      const openMonthKey = toYearMonthKey(getRegionalDealOpenDate(deal));
      const churnMonthKey =
        churnLines > 0
          ? toYearMonthKey(normalizeRegionalDealDate(deal.churnDate) || normalizeRegionalDealDate(deal.createdAt))
          : null;

      if (openMonthKey) {
        if (openMonthKey < firstMonthKey) openingLines += lineCount;
        if (openLinesMap.has(openMonthKey)) {
          openLinesMap.set(openMonthKey, (openLinesMap.get(openMonthKey) || 0) + lineCount);
        }
      }

      if (churnLines > 0 && churnMonthKey) {
        if (churnMonthKey < firstMonthKey) openingLines -= churnLines;
        if (churnLinesMap.has(churnMonthKey)) {
          churnLinesMap.set(churnMonthKey, (churnLinesMap.get(churnMonthKey) || 0) + churnLines);
        }
      }
    });

    let carriedLines = Math.max(openingLines, 0);
    const baseRows = monthKeysInRange.map((yearMonth) => {
      const openLines = openLinesMap.get(yearMonth) || 0;
      const churnLines = churnLinesMap.get(yearMonth) || 0;
      const totalMovement = openLines + churnLines;
      const totalLines = Math.max(0, carriedLines + openLines - churnLines);
      carriedLines = totalLines;

      const sales = totalLines * 500;
      const receivables = regionalReceivablesByMonth.get(yearMonth) || 0;
      const managementCost = 0;
      const operatingProfit = sales - receivables - managementCost;

      return {
        yearMonth,
        monthLabel: `${parseInt(yearMonth.split("-")[1] || "0", 10)}월`,
        openLines,
        churnLines,
        openRate: totalMovement > 0 ? (openLines / totalMovement) * 100 : 0,
        churnRate: totalMovement > 0 ? (churnLines / totalMovement) * 100 : 0,
        openTarget: REGIONAL_OPEN_TARGET,
        churnDefenseTarget: REGIONAL_CHURN_DEFENSE_TARGET,
        openAchievementRate: REGIONAL_OPEN_TARGET > 0 ? (openLines / REGIONAL_OPEN_TARGET) * 100 : 0,
        churnDefenseAchievementRate:
          REGIONAL_CHURN_DEFENSE_TARGET > 0 ? (churnLines / REGIONAL_CHURN_DEFENSE_TARGET) * 100 : 0,
        totalLines,
        monthlyLines: totalLines,
        churnLineRate: totalMovement > 0 ? (churnLines / totalMovement) * 100 : 0,
        sales,
        receivables,
        managementCost,
        operatingProfit,
      };
    });

    return baseRows.map((row, index) => {
      if (index === 0) {
        return {
          ...row,
          operatingProfitChangeRate: 0,
        };
      }
      const previous = baseRows[index - 1];
      return {
        ...row,
        operatingProfitChangeRate: computeChangePercentValue(row.operatingProfit, previous.operatingProfit),
      };
    });
  }, [regionalData?.monthlyStatusData, allRegionalDeals, monthKeysInRange, regionalReceivablesByMonth]);

  const regionalSelectedMonthKey = toYearMonthKey(
    startDate.getTime() > endDate.getTime() ? startDate : endDate,
  );
  const selectedRegionalMonthlyStatusRow =
    regionalMonthlyStatusRows.find((row) => row.yearMonth === regionalSelectedMonthKey) ||
    regionalMonthlyStatusRows[regionalMonthlyStatusRows.length - 1];
  const currentRegionalMonthOpenLines = selectedRegionalMonthlyStatusRow?.openLines || 0;

  const regionalChurnRateRows = useMemo(
    () => regionalMonthlyStatusRows.slice(-REGIONAL_CHURN_RATE_VISIBLE_MONTHS),
    [regionalMonthlyStatusRows],
  );

  const regionalMonthlyChurnDealRows = useMemo(() => {
    const baseKeysFromStatus = regionalMonthlyStatusRows
      .slice(-REGIONAL_CHURN_RATE_VISIBLE_MONTHS)
      .map((row) => row.yearMonth);
    const baseKeysFromServer = (regionalData?.monthlyNewDealsData || [])
      .map((row) => row.yearMonth)
      .slice(-REGIONAL_CHURN_RATE_VISIBLE_MONTHS);
    const baseKeys = (baseKeysFromStatus.length > 0 ? baseKeysFromStatus : baseKeysFromServer).filter(Boolean);
    const uniqueKeys = Array.from(new Set(baseKeys)).sort((a, b) => a.localeCompare(b));
    const counts = new Map(uniqueKeys.map((key) => [key, 0]));

    allRegionalDeals.forEach((deal) => {
      if (deal.stage !== "churned") return;
      const churnMonthKey = toYearMonthKey(normalizeRegionalDealDate(deal.churnDate));
      if (!churnMonthKey || !counts.has(churnMonthKey)) return;
      counts.set(churnMonthKey, (counts.get(churnMonthKey) || 0) + 1);
    });

    return uniqueKeys.map((yearMonth) => ({
      yearMonth,
      month: `${parseInt(yearMonth.split("-")[1] || "0", 10)}월`,
      dealCount: counts.get(yearMonth) || 0,
    }));
  }, [allRegionalDeals, regionalData?.monthlyNewDealsData, regionalMonthlyStatusRows]);

  const selectedRegionalMonthlyChurnDealRow =
    regionalMonthlyChurnDealRows.find((row) => row.yearMonth === regionalSelectedMonthKey) ||
    regionalMonthlyChurnDealRows[regionalMonthlyChurnDealRows.length - 1];
  const currentRegionalMonthChurnDeals = selectedRegionalMonthlyChurnDealRow?.dealCount || 0;
  const currentRegionalMonthLabel =
    selectedRegionalMonthlyStatusRow?.monthLabel ||
    selectedRegionalMonthlyChurnDealRow?.month ||
    `${new Date().getMonth() + 1}월`;
  const regionalMonthlyChurnLineRows = useMemo(
    () =>
      regionalMonthlyStatusRows.slice(-REGIONAL_CHURN_RATE_VISIBLE_MONTHS).map((row) => ({
        yearMonth: row.yearMonth,
        month: row.monthLabel,
        lineCount: row.churnLines,
      })),
    [regionalMonthlyStatusRows],
  );

  const regionalMonthlyStatusRowsRecent3 = useMemo(
    () => regionalMonthlyStatusRows.slice(-REGIONAL_MONTHLY_STATUS_VISIBLE_MONTHS),
    [regionalMonthlyStatusRows],
  );

  const regionalMonthlyComparisonPair = useMemo(() => {
    if (regionalMonthlyStatusRows.length < 2) return null;

    const currentMonthKey = toYearMonthKey(getKoreanNow());
    const hasCurrentMonthRow = currentMonthKey
      ? regionalMonthlyStatusRows.some((row) => row.yearMonth === currentMonthKey)
      : false;
    const comparisonRows = hasCurrentMonthRow
      ? regionalMonthlyStatusRows.filter((row) => row.yearMonth !== currentMonthKey)
      : regionalMonthlyStatusRows;

    if (comparisonRows.length < 2) return null;

    return {
      current: comparisonRows[comparisonRows.length - 1],
      previous: comparisonRows[comparisonRows.length - 2],
    };
  }, [regionalMonthlyStatusRows]);

  const regionalMonthlyStatusChangeRow = useMemo(() => {
    if (!regionalMonthlyComparisonPair) return null;
    const { current, previous } = regionalMonthlyComparisonPair;

    return {
      openLines: computeChangePercentValue(current.openLines, previous.openLines),
      churnLines: computeChangePercentValue(current.churnLines, previous.churnLines),
      openRate: computeChangePercentValue(current.openRate, previous.openRate),
      churnRate: computeChangePercentValue(current.churnRate, previous.churnRate),
      openTarget: computeChangePercentValue(current.openTarget, previous.openTarget),
      churnDefenseTarget: computeChangePercentValue(current.churnDefenseTarget, previous.churnDefenseTarget),
      openAchievementRate: computeChangePercentValue(current.openAchievementRate, previous.openAchievementRate),
      churnDefenseAchievementRate: computeChangePercentValue(
        current.churnDefenseAchievementRate,
        previous.churnDefenseAchievementRate,
      ),
      totalLines: computeChangePercentValue(current.totalLines, previous.totalLines),
      sales: computeChangePercentValue(current.sales, previous.sales),
      receivables: computeChangePercentValue(current.receivables, previous.receivables),
      managementCost: computeChangePercentValue(current.managementCost, previous.managementCost),
      operatingProfit: computeChangePercentValue(current.operatingProfit, previous.operatingProfit),
      operatingProfitChangeRate: current.operatingProfitChangeRate,
    };
  }, [regionalMonthlyComparisonPair]);

  const formatContractDate = (date: string | Date) => {
    try {
      return format(new Date(date), "yyyy-MM-dd");
    } catch { return "-"; }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">매출분석</h1>
          {analytics && (
            <span className="text-sm text-muted-foreground font-normal">
              {analytics.isExecutive ? "전체 데이터" : `${analytics.userName} 개인 데이터`}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap p-4 bg-card border border-border rounded-none" data-testid="sales-filter">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">통합 필터</span>
        </div>

        <div className="h-6 w-px bg-border" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-56 justify-start gap-2 rounded-none" data-testid="filter-date">
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

        <Select value={departmentFilter} onValueChange={setDepartmentFilter} disabled={isDeptLocked}>
          <SelectTrigger className="w-32 rounded-none" data-testid="filter-department">
            <SelectValue placeholder="부서" />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all">부서 전체</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" className="gap-1 rounded-none ml-auto" onClick={handleReset} data-testid="button-reset-filter">
          <RefreshCw className="w-4 h-4" />
          초기화
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">데이터를 불러오는 중...</div>
      ) : (
        <>
          {(isMarketing || !isRegional) && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">마케팅팀</div>
              <div className="text-sm text-muted-foreground">모든 금액은 부가세 제외 기준입니다.</div>
              <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CircleDollarSign className="w-4 h-4" />
                      총 매출
                    </div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-total-sales">{formatAmount(marketingTotalSales)}원</div>
                    <div className="text-xs text-muted-foreground mt-1">부가세 제외 / 환불 전 기준</div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <RotateCcw className="w-4 h-4" />
                      총 환불
                    </div>
                    <div className="text-2xl font-bold mt-1 text-red-500">{formatAmount(marketingTotalRefunds)}원</div>
                    <div className="text-xs text-muted-foreground mt-1">현재 필터 기준 환불 합계</div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="w-4 h-4" />
                      총 작업비
                    </div>
                    <div className="text-2xl font-bold mt-1 text-amber-600" data-testid="text-total-work-cost">{formatAmount(marketingTotalWorkCost)}원</div>
                    <div className="text-xs text-muted-foreground mt-1">현재 필터 기준 작업비 합계</div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="w-4 h-4" />
                      슬롯 발주 일수
                    </div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-slot-count">{formatAmount(marketingSlotOrderDays)}일</div>
                    <div className="text-xs text-muted-foreground mt-1">슬롯 상품 발주 일수</div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Sparkles className="w-4 h-4" />
                      바이럴 계약건수
                    </div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-viral-count">{marketingViralContractCount}건</div>
                    <div className="text-xs text-muted-foreground mt-1">바이럴 상품 계약</div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="w-4 h-4" />
                      순수익
                    </div>
                    <div className="text-2xl font-bold mt-1 text-emerald-600" data-testid="text-net-profit">{formatAmount(marketingNetProfit)}원</div>
                    <div className="text-xs text-muted-foreground mt-1">총매출 - 총환불 - 총작업비</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {(isRegional || !isMarketing) && (
            <div className="space-y-2">
              {!isMarketing && !isRegional && <div className="text-sm font-semibold text-muted-foreground">타지역팀</div>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      총 회선수
                    </div>
                    <div className="text-2xl font-bold mt-1" data-testid="text-total-lines">{formatAmount(regionalSummary?.totalLineCount || 0)}회선</div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UserPlus className="w-4 h-4 text-blue-500" />
                      인입
                    </div>
                    <div className="text-2xl font-bold mt-1 text-blue-500" data-testid="text-new-deals">
                      {formatAmount(regionalSummary?.newDeals || 0)}건
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UserCheck className="w-4 h-4 text-emerald-500" />
                      당월개통
                    </div>
                    <div className="text-2xl font-bold mt-1 text-emerald-500" data-testid="text-active-deals">
                      {formatAmount(currentRegionalMonthOpenLines)}회선
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UserX className="w-4 h-4 text-red-500" />
                      해지
                    </div>
                    <div className="text-2xl font-bold mt-1 text-red-500" data-testid="text-churned-deals">{formatAmount(regionalSummary?.churnedLines || 0)}회선</div>
                    <div className="text-xs text-muted-foreground mt-1">{currentRegionalMonthLabel} 해지 ({currentRegionalMonthChurnDeals}건)</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {(isMarketing || !isRegional) && (
            <div className="space-y-4">
              {!isMarketing && !isRegional && (
                <div className="flex items-center gap-2 pt-2">
                  <div className="w-1 h-5 bg-primary" />
                  <h2 className="text-base font-bold">마케팅팀</h2>
                </div>
              )}
                <Card className="rounded-none">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="text-base">년별 매출 추이</CardTitle>
                      <Select value={marketingTrendYear} onValueChange={setMarketingTrendYear}>
                        <SelectTrigger className="w-28 rounded-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          {marketingTrendYearOptions.map((year) => (
                            <SelectItem key={year} value={String(year)}>
                              {year}년
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                    {marketingTrendData.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터가 없습니다</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={marketingTrendData} barSize={28} barGap={4} barCategoryGap="18%">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={formatAmount} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 0, color: "hsl(var(--foreground))" }}
                            formatter={(value: number, name: string) => [`${formatAmount(value)}원`, name]}
                            labelStyle={{ color: "hsl(var(--foreground))" }}
                          />
                          <Legend />
                          <Bar dataKey="매출" fill="#135bec" radius={0} />
                          <Bar dataKey="작업비" fill="#d97706" radius={0} />
                          <Bar dataKey="환불" fill="#ef4444" radius={0} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card className="rounded-none flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">담당자별 매출 현황</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="h-64 overflow-y-auto">
                      {managerData.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터가 없습니다</div>
                      ) : (
                        <div style={{ minHeight: `${managerChartHeight}px` }}>
                          <ResponsiveContainer width="100%" height={managerChartHeight}>
                            <BarChart
                              data={managerData}
                              layout="vertical"
                              margin={{ top: 4, right: 18, bottom: 8, left: 0 }}
                              barCategoryGap="18%"
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={formatAmount} />
                              <YAxis
                                type="category"
                                dataKey="manager"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                width={88}
                                tickMargin={6}
                              />
                              <Tooltip
                                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 0, color: "hsl(var(--foreground))" }}
                                formatter={(value: number, name: string) => [
                                  `${formatAmount(value)}원`,
                                  name
                                ]}
                                labelStyle={{ color: "hsl(var(--foreground))" }}
                              />
                              <Legend />
                              <Bar dataKey="매출" fill="#135bec" radius={0} />
                              <Bar dataKey="작업비" fill="#d97706" radius={0} />
                              <Bar dataKey="환불" fill="#ef4444" radius={0} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-none flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">상품별 매출 현황</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    {(() => {
                      const currentProductData = isMarketing ? marketingProductData : productData;
                      const totalProductPages = Math.ceil(currentProductData.length / PRODUCT_SALES_PER_PAGE);
                      const pagedProductData = currentProductData.slice(
                        (productSalesPage - 1) * PRODUCT_SALES_PER_PAGE,
                        productSalesPage * PRODUCT_SALES_PER_PAGE
                      );
                      return (
                        <>
                          <div className="flex-1 overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30">
                                  <TableHead className="text-xs font-medium whitespace-nowrap">상품</TableHead>
                                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">매출</TableHead>
                                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">건수</TableHead>
                                  <TableHead className="text-xs font-medium text-right whitespace-nowrap">비중</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pagedProductData.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={4} className="p-8 text-center text-muted-foreground text-sm">데이터가 없습니다</TableCell>
                                  </TableRow>
                                ) : (
                                  pagedProductData.map((item, idx) => (
                                    <TableRow key={idx} className="hover:bg-muted/20" data-testid={`row-product-sales-${idx}`}>
                                      <TableCell className="text-sm font-medium" data-testid={`text-product-name-${idx}`}>
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3" style={{ backgroundColor: item.color }} />
                                          {item.name}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-sm text-right font-bold" data-testid={`text-product-sales-${idx}`}>{formatAmount(item.sales)}원</TableCell>
                                      <TableCell className="text-sm text-right" data-testid={`text-product-count-${idx}`}>{item.count}건</TableCell>
                                      <TableCell className="text-sm text-right text-muted-foreground" data-testid={`text-product-ratio-${idx}`}>{item.value}%</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </div>
                          {totalProductPages > 1 && (
                            <div className="flex items-center justify-between pt-2 mt-auto border-t">
                              <span className="text-xs text-muted-foreground">
                                {currentProductData.length}개 중 {(productSalesPage - 1) * PRODUCT_SALES_PER_PAGE + 1}-{Math.min(productSalesPage * PRODUCT_SALES_PER_PAGE, currentProductData.length)}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setProductSalesPage(p => Math.max(1, p - 1))}
                                  disabled={productSalesPage === 1}
                                  data-testid="button-product-sales-prev"
                                >
                                  이전
                                </Button>
                                <span className="text-xs text-muted-foreground px-2">
                                  {productSalesPage} / {totalProductPages}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setProductSalesPage(p => Math.min(totalProductPages, p + 1))}
                                  disabled={productSalesPage === totalProductPages}
                                  data-testid="button-product-sales-next"
                                >
                                  다음
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {(isRegional || !isMarketing) && (
            <div className="space-y-4">
              {!isMarketing && !isRegional && (
                <div className="flex items-center gap-2 pt-2">
                  <div className="w-1 h-5 bg-blue-500" />
                  <h2 className="text-base font-bold">타지역팀</h2>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Card className="rounded-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">월별 개통 회선수 (최근 3개월)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      {(() => {
                        const recentMonths = regionalMonthlyStatusRows.slice(-REGIONAL_CHURN_RATE_VISIBLE_MONTHS).map((row) => ({
                          yearMonth: row.yearMonth,
                          lineCount: row.openLines,
                        }));
                        if (recentMonths.length === 0) {
                          return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터가 없습니다</div>;
                        }
                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={recentMonths}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis
                                dataKey="yearMonth"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickFormatter={(value: string) => `${parseInt(value.split("-")[1], 10)}월`}
                              />
                              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                              <Tooltip
                                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 0, color: "hsl(var(--foreground))" }}
                                formatter={(value: number) => [`${value}회선`, "개통"]}
                                labelStyle={{ color: "hsl(var(--foreground))" }}
                              />
                              <Bar dataKey="lineCount" fill="#3b82f6" radius={0} />
                            </BarChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">월별 해지회선수 (최근 3개월)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      {regionalMonthlyChurnLineRows.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터가 없습니다</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={regionalMonthlyChurnLineRows}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                              dataKey="yearMonth"
                              stroke="hsl(var(--muted-foreground))"
                              fontSize={12}
                              tickFormatter={(value: string) => `${parseInt(value.split("-")[1], 10)}월`}
                            />
                            <YAxis
                              stroke="hsl(var(--muted-foreground))"
                              fontSize={12}
                              tickFormatter={(value: number) => `${value}회선`}
                            />
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 0, color: "hsl(var(--foreground))" }}
                              formatter={(value: number) => [`${value}회선`, "해지회선수"]}
                            />
                            <Bar dataKey="lineCount" name="해지회선수" fill="#ef4444" radius={0} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-center">월간 현황</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {regionalMonthlyStatusRowsRecent3.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">데이터가 없습니다</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto border border-border">
                        <Table className={regionalMonthlyTableClass}>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className={regionalMonthlyHeadClass}>기간</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>개통</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>해지</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>개통 비율</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>해지 비율</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>개통 목표</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>해지 목표</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>개통 달성율</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>해지 달성률</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>총회선수</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {regionalMonthlyStatusRowsRecent3.map((row) => (
                              <TableRow key={`regional-monthly-status-${row.yearMonth}`}>
                                <TableCell className={regionalMonthlyLabelCellClass}>{row.monthLabel}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmount(row.openLines)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmount(row.churnLines)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-blue-600`}>{formatRate(row.openRate)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-red-500`}>{formatRate(row.churnRate, true)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmount(row.openTarget)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmount(row.churnDefenseTarget)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-blue-600`}>{formatRate(row.openAchievementRate)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-red-500`}>{formatRate(row.churnDefenseAchievementRate, true)}</TableCell>
                                <TableCell className={regionalMonthlyEmphasisCellClass}>{formatAmount(row.totalLines)}</TableCell>
                              </TableRow>
                            ))}
                            {regionalMonthlyStatusChangeRow && (
                              <TableRow className="bg-muted/20">
                                <TableCell className={`${regionalMonthlyLabelCellClass} font-semibold`}>전월 대비 증감률</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.openLines, true)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.churnLines, true)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-blue-600`}>{formatRate(regionalMonthlyStatusChangeRow.openRate, true)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-red-500`}>{formatRate(regionalMonthlyStatusChangeRow.churnRate, true)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.openTarget, true)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.churnDefenseTarget, true)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-blue-600`}>{formatRate(regionalMonthlyStatusChangeRow.openAchievementRate, true)}</TableCell>
                                <TableCell className={`${regionalMonthlyValueCellClass} text-red-500`}>{formatRate(regionalMonthlyStatusChangeRow.churnDefenseAchievementRate, true)}</TableCell>
                                <TableCell className={regionalMonthlyEmphasisCellClass}>{formatRate(regionalMonthlyStatusChangeRow.totalLines, true)}</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="overflow-x-auto border border-border">
                        <Table className={regionalMonthlyTableClass}>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className={regionalMonthlyHeadClass}>기간</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>영업 매출</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>미납 채권</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>관리비</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>영업 이익</TableHead>
                              <TableHead className={regionalMonthlyHeadClass}>영업 이익 증감률</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {regionalMonthlyStatusRowsRecent3.map((row) => (
                              <TableRow key={`regional-monthly-finance-${row.yearMonth}`}>
                                <TableCell className={regionalMonthlyLabelCellClass}>{row.monthLabel}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmount(row.sales)}원</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmountOrDash(row.receivables)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmountOrDash(row.managementCost)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatAmount(row.operatingProfit)}원</TableCell>
                                <TableCell className={regionalMonthlyEmphasisCellClass}>{formatRate(row.operatingProfitChangeRate, true)}</TableCell>
                              </TableRow>
                            ))}
                            {regionalMonthlyStatusChangeRow && (
                              <TableRow className="bg-muted/20">
                                <TableCell className={`${regionalMonthlyLabelCellClass} font-semibold`}>전월 대비 증감률</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.sales, true)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.receivables, true)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.managementCost, true)}</TableCell>
                                <TableCell className={regionalMonthlyValueCellClass}>{formatRate(regionalMonthlyStatusChangeRow.operatingProfit, true)}</TableCell>
                                <TableCell className={regionalMonthlyEmphasisCellClass}>{formatRate(regionalMonthlyStatusChangeRow.operatingProfitChangeRate, true)}</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          {/* Contract Detail Table */}
          {showMarketingContractDetails && (() => {
            const selectedTotalCount = filteredMarketingContracts.length;
            const totalContractPages = Math.ceil(selectedTotalCount / CONTRACTS_PER_PAGE);
            const safeContractPage = Math.min(contractPage, Math.max(1, totalContractPages));
            const pagedMarketingContracts = filteredMarketingContracts.slice(
              (safeContractPage - 1) * CONTRACTS_PER_PAGE,
              safeContractPage * CONTRACTS_PER_PAGE
            );

            return (
              <Card className="rounded-none">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">계약 상세 목록</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">마케팅팀 계약관리</span>
                      <span className="text-xs text-muted-foreground">총 {selectedTotalCount}건</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs font-medium whitespace-nowrap">계약일</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">계약명</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">고객명</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">담당자</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">상품</TableHead>
                          <TableHead className="text-xs font-medium text-right whitespace-nowrap">계약금액</TableHead>
                          <TableHead className="text-xs font-medium text-center whitespace-nowrap">결제확인</TableHead>
                          <TableHead className="text-xs font-medium text-right whitespace-nowrap">환불금액</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">환불일자</TableHead>
                          <TableHead className="text-xs font-medium text-right whitespace-nowrap">작업비</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">작업자</TableHead>
                          <TableHead className="text-xs font-medium text-center whitespace-nowrap">실행비결제</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">지급현황</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">비고</TableHead>
                          <TableHead className="text-xs font-medium whitespace-nowrap">부가세</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedMarketingContracts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={15} className="p-8 text-center text-muted-foreground text-sm">데이터가 없습니다</TableCell>
                          </TableRow>
                        ) : (
                          pagedMarketingContracts.map((contract) => (
                            <TableRow key={contract.id} className="hover:bg-muted/20" data-testid={`row-sales-contract-${contract.id}`}>
                              <TableCell className="text-xs whitespace-nowrap">{formatContractDate(contract.contractDate)}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.contractName || "-"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.customerName}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.managerName}</TableCell>
                              <TableCell className="text-xs">
                                <span className="truncate max-w-[120px] block">{contract.products || "-"}</span>
                              </TableCell>
                              <TableCell className="text-xs text-right whitespace-nowrap">{formatAmount(contract.cost)}원</TableCell>
                              <TableCell className="text-xs text-center whitespace-nowrap">{contract.paymentConfirmed ? "확인" : "미확인"}</TableCell>
                              <TableCell className="text-xs text-right whitespace-nowrap">{contract.totalRefund > 0 ? formatAmount(contract.totalRefund) + "원" : "-"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.lastRefundDate ? formatContractDate(contract.lastRefundDate) : "-"}</TableCell>
                              <TableCell className="text-xs text-right whitespace-nowrap">{contract.workCost ? formatAmount(contract.workCost) + "원" : "-"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.worker || "-"}</TableCell>
                              <TableCell className="text-xs text-center whitespace-nowrap">{contract.executionPaymentStatus || "-"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.disbursementStatus || "-"}</TableCell>
                              <TableCell className="text-xs">
                                <span className="truncate max-w-[100px] block">{contract.notes || "-"}</span>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{contract.invoiceIssued || "-"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {totalContractPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <span className="text-xs text-muted-foreground">
                        {selectedTotalCount}건 중 {(safeContractPage - 1) * CONTRACTS_PER_PAGE + 1}-{Math.min(safeContractPage * CONTRACTS_PER_PAGE, selectedTotalCount)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setContractPage(1)} disabled={safeContractPage === 1} data-testid="button-contract-first">처음</Button>
                        <Button variant="ghost" size="sm" onClick={() => setContractPage(p => Math.max(1, p - 1))} disabled={safeContractPage === 1} data-testid="button-contract-prev">이전</Button>
                        <span className="text-xs text-muted-foreground px-2">{safeContractPage} / {totalContractPages}</span>
                        <Button variant="ghost" size="sm" onClick={() => setContractPage(p => Math.min(totalContractPages, p + 1))} disabled={safeContractPage === totalContractPages} data-testid="button-contract-next">다음</Button>
                        <Button variant="ghost" size="sm" onClick={() => setContractPage(totalContractPages)} disabled={safeContractPage === totalContractPages} data-testid="button-contract-last">마지막</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}

