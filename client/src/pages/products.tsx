import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Search, Edit, Trash2 } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { productCategories, type Product, type InsertProduct, type ProductRateHistory } from "@shared/schema";

const PRODUCT_DETAIL_CUSTOM_VALUE = "__CUSTOM_PRODUCT_DETAIL__";
const DEFAULT_PRODUCT_DETAIL_BY_GROUP: Record<string, string> = {
  슬롯: "슬롯",
  타지역상품: "타지역서비스",
  바이럴상품: "바이럴상품",
  기타: "기타",
};

function normalizeCategoryKey(value: unknown): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeCategoryLabel(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "?????") return "바이럴상품";
  return raw;
}

function normalizeProductCategoryGroup(value: unknown): string {
  const raw = normalizeCategoryLabel(value);
  const compact = normalizeCategoryKey(raw);

  if (!compact) return "기타";
  if (compact.includes("타지역")) return "타지역상품";
  if (compact.includes("슬롯")) return "슬롯";
  if (compact.includes("바이럴")) return "바이럴상품";
  if (compact === "기타") return "기타";
  return "기타";
}

function isRegionalCategory(value: unknown): boolean {
  return normalizeCategoryKey(value).includes("타지역");
}

function resolveProductDetail(category: unknown, unit: unknown): string {
  const unitLabel = String(unit || "").trim();
  if (unitLabel && unitLabel !== "일") return unitLabel;

  const categoryLabel = normalizeCategoryLabel(category);
  const categoryGroup = normalizeProductCategoryGroup(categoryLabel);
  if (!categoryLabel) {
    return DEFAULT_PRODUCT_DETAIL_BY_GROUP[categoryGroup] || "";
  }

  if (categoryGroup === "슬롯" || categoryGroup === "타지역상품") {
    return categoryLabel;
  }

  if (categoryGroup === "바이럴상품") {
    return categoryLabel === "바이럴상품" ? DEFAULT_PRODUCT_DETAIL_BY_GROUP[categoryGroup] : categoryLabel;
  }

  return categoryLabel;
}

export default function ProductsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [customProductDetailInput, setCustomProductDetailInput] = useState("");
  const [formData, setFormData] = useState<Partial<InsertProduct>>({
    name: "",
    category: "",
    unitPrice: 0,
    unit: "",
    baseDays: undefined,
    workCost: undefined,
    worker: "",
    notes: "",
    isActive: true,
  });

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: productRateHistories = [] } = useQuery<ProductRateHistory[]>({
    queryKey: ["/api/product-rate-histories", editingProduct?.id || "none"],
    enabled: !!editingProduct?.id,
    queryFn: async () => {
      if (!editingProduct?.id) return [];
      const response = await fetch(`/api/product-rate-histories?productId=${editingProduct.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch product rate histories");
      }
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertProduct & { effectiveFrom?: string }) => {
      return apiRequest("POST", "/api/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: "상품이 등록되었습니다." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertProduct> & { effectiveFrom?: string } }) => {
      return apiRequest("PUT", `/api/products/${id}`, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/product-rate-histories", variables.id] });
      setEditingProduct(null);
      resetForm();
      toast({ title: "상품이 수정되었습니다." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "상품이 삭제되었습니다." });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      category: productCategories[0],
      unitPrice: 0,
      unit: DEFAULT_PRODUCT_DETAIL_BY_GROUP[productCategories[0]] || "",
      baseDays: undefined,
      workCost: undefined,
      worker: "",
      notes: "",
      isActive: true,
    });
    setCustomProductDetailInput("");
    setEffectiveFrom(new Date().toISOString().split("T")[0]);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: "상품명을 입력해주세요.", variant: "destructive" });
      return;
    }
    const resolvedCategory = normalizeProductCategoryGroup(formData.category);
    const resolvedProductDetail =
      formData.unit === PRODUCT_DETAIL_CUSTOM_VALUE
        ? customProductDetailInput.trim()
        : String(formData.unit || "").trim();

    if (!resolvedCategory) {
      toast({ title: "상품구분을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!productCategories.includes(resolvedCategory as (typeof productCategories)[number])) {
      toast({ title: "올바른 상품구분을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (user?.department === "타지역팀" && !isRegionalCategory(resolvedCategory)) {
      toast({ title: "타지역팀은 타지역 카테고리 상품만 등록할 수 있습니다.", variant: "destructive" });
      return;
    }
    const payload = {
      ...formData,
      category: resolvedCategory,
      unit: resolvedProductDetail || DEFAULT_PRODUCT_DETAIL_BY_GROUP[resolvedCategory] || "",
      effectiveFrom,
    };
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      createMutation.mutate(payload as InsertProduct & { effectiveFrom?: string });
    }
  };

  const handleEdit = (product: Product) => {
    const normalizedCategory = normalizeProductCategoryGroup(product.category);
    const resolvedProductDetail = resolveProductDetail(product.category, product.unit);
    setEditingProduct(product);
    setCustomProductDetailInput("");
    setFormData({
      name: product.name,
      category: normalizedCategory,
      unitPrice: product.unitPrice,
      unit: resolvedProductDetail || DEFAULT_PRODUCT_DETAIL_BY_GROUP[normalizedCategory] || "",
      baseDays: product.baseDays || 0,
      workCost: product.workCost || 0,
      worker: product.worker || "",
      notes: product.notes || "",
      isActive: product.isActive ?? true,
    });
    setEffectiveFrom(new Date().toISOString().split("T")[0]);
  };

  const visibleProducts = user?.department === "타지역팀"
    ? products.filter((product) => isRegionalCategory(product.category))
    : products;

  const filteredProducts = visibleProducts.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const categoryOptions = useMemo(() => {
    return productCategories.filter((category) => user?.department !== "타지역팀" || isRegionalCategory(category));
  }, [user?.department]);

  const productDetailOptionsByCategory = useMemo(() => {
    const optionMap = new Map<string, string[]>();
    for (const category of categoryOptions) {
      optionMap.set(category, [DEFAULT_PRODUCT_DETAIL_BY_GROUP[category] || category]);
    }

    for (const product of visibleProducts) {
      const categoryGroup = normalizeProductCategoryGroup(product.category);
      if (!optionMap.has(categoryGroup)) continue;
      const detail = resolveProductDetail(product.category, product.unit);
      if (!detail) continue;
      const details = optionMap.get(categoryGroup)!;
      if (!details.includes(detail)) {
        details.push(detail);
      }
    }

    const selectedCategory = normalizeProductCategoryGroup(formData.category);
    const selectedDetail = String(formData.unit || "").trim();
    if (selectedCategory && selectedDetail && selectedDetail !== PRODUCT_DETAIL_CUSTOM_VALUE) {
      const details = optionMap.get(selectedCategory) || [];
      if (!details.includes(selectedDetail)) {
        details.unshift(selectedDetail);
      }
      optionMap.set(selectedCategory, details);
    }

    Array.from(optionMap.entries()).forEach(([category, details]) => {
      const baseDetail = DEFAULT_PRODUCT_DETAIL_BY_GROUP[category];
      const sorted = Array.from(new Set(details)).sort((left, right) => {
        if (left === baseDetail) return -1;
        if (right === baseDetail) return 1;
        return left.localeCompare(right, "ko");
      });
      optionMap.set(category, [...sorted, PRODUCT_DETAIL_CUSTOM_VALUE]);
    });

    return optionMap;
  }, [categoryOptions, visibleProducts, formData.category, formData.unit]);

  const selectedCategoryDetails = useMemo(() => {
    return productDetailOptionsByCategory.get(normalizeProductCategoryGroup(formData.category)) || [];
  }, [productDetailOptionsByCategory, formData.category]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ko-KR").format(price) + "원";
  };

  const formatDateOnly = (value: Date | string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("ko-KR");
  };

  const productFormJSX = (
    <div className="space-y-6 py-4">
      <div className="border-b pb-2">
        <h3 className="font-medium text-sm">기본 정보</h3>
      </div>
      
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label className="text-sm">
            <span className="text-red-500">*</span> 상품명
          </Label>
          <Input
            className="rounded-none"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder=""
            data-testid="input-product-name"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">
            <span className="text-red-500">*</span> 상품구분
          </Label>
          <Select
            value={formData.category || ""}
            onValueChange={(value) => {
              const details = productDetailOptionsByCategory.get(value) || [];
              const nextDetail = details.find((detail) => detail !== PRODUCT_DETAIL_CUSTOM_VALUE) || "";
              setFormData((prev) => ({ ...prev, category: value, unit: nextDetail }));
              setCustomProductDetailInput("");
            }}
          >
            <SelectTrigger className="rounded-none" data-testid="select-product-category">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {categoryOptions.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm">상품상세</Label>
          <Select
            value={formData.unit || ""}
            onValueChange={(value) => {
              setFormData((prev) => ({ ...prev, unit: value }));
              if (value !== PRODUCT_DETAIL_CUSTOM_VALUE) {
                setCustomProductDetailInput("");
              }
            }}
          >
            <SelectTrigger className="rounded-none" data-testid="select-product-unit">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {selectedCategoryDetails.map((detail) => (
                <SelectItem key={detail} value={detail}>
                  {detail === PRODUCT_DETAIL_CUSTOM_VALUE ? "직접입력" : detail}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formData.unit === PRODUCT_DETAIL_CUSTOM_VALUE && (
            <Input
              className="mt-2 rounded-none"
              value={customProductDetailInput}
              onChange={(e) => setCustomProductDetailInput(e.target.value)}
              placeholder=""
              data-testid="input-custom-product-unit"
            />
          )}
        </div>
        <div className="space-y-2">
          <Label className="text-sm">작업자</Label>
          <Input
            className="rounded-none"
            value={formData.worker || ""}
            onChange={(e) => setFormData({ ...formData, worker: e.target.value })}
            placeholder=""
            data-testid="input-product-worker"
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label className="text-sm">기준일수</Label>
          <div className="flex items-center gap-2">
            <Input
              className="rounded-none"
              type="number"
              value={formData.baseDays ?? ""}
              onChange={(e) =>
                setFormData((prev) => {
                  const rawValue = e.target.value;
                  const parsedValue = Number(rawValue);
                  return {
                    ...prev,
                    baseDays: rawValue === "" || Number.isNaN(parsedValue) ? undefined : parsedValue,
                  };
                })
              }
              placeholder="예: 10"
              data-testid="input-product-base-days"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">일</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm">작업비</Label>
          <Input
            className="rounded-none"
            type="number"
            value={formData.workCost ?? ""}
            onChange={(e) =>
              setFormData((prev) => {
                const rawValue = e.target.value;
                const parsedValue = Number(rawValue);
                return {
                  ...prev,
                  workCost: rawValue === "" || Number.isNaN(parsedValue) ? undefined : parsedValue,
                };
              })
            }
            placeholder=""
            data-testid="input-product-work-cost"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">금액 적용 시작일</Label>
          <Input
            className="rounded-none"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            data-testid="input-product-effective-from"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">비고</Label>
          <Input
            className="rounded-none"
            value={formData.notes || ""}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder=""
            data-testid="input-product-notes"
          />
        </div>
      </div>

      {editingProduct && (
        <div className="space-y-2 border-t pt-4">
          <h4 className="text-sm font-medium">금액 변경 이력</h4>
          <div className="border rounded-none overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">적용일</TableHead>
                  <TableHead className="text-xs text-right">작업비</TableHead>
                  <TableHead className="text-xs text-right">기준일수</TableHead>
                  <TableHead className="text-xs">작업자</TableHead>
                  <TableHead className="text-xs">부가세구분</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productRateHistories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-4">
                      등록된 이력이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  productRateHistories.map((history) => (
                    <TableRow key={history.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatDateOnly(history.effectiveFrom)}</TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">
                        {formatPrice(history.workCost ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">{history.baseDays || 0}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{history.worker || "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{history.vatType || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button 
          variant="outline" 
          className="rounded-none" 
          onClick={() => {
            setIsAddDialogOpen(false);
            setEditingProduct(null);
            resetForm();
          }}
        >
          취소
        </Button>
        <Button 
          className="rounded-none" 
          onClick={handleSubmit} 
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {editingProduct ? "수정" : "등록"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">상품</h1>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-none" data-testid="button-add-product" onClick={resetForm}>
              <Plus className="w-4 h-4" />
              상품 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-none max-w-4xl">
            <DialogHeader>
              <DialogTitle>상품 등록</DialogTitle>
            </DialogHeader>
            {productFormJSX}
          </DialogContent>
        </Dialog>
      </div>

      <Card className="rounded-none">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 rounded-none"
                placeholder="상품 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-product"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">상품이 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs whitespace-nowrap">상품명</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">상품구분</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">상품상세</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">기준일수</TableHead>
                  <TableHead className="text-right text-xs whitespace-nowrap">작업비</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">작업자</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">비고</TableHead>
                  <TableHead className="w-24 text-xs whitespace-nowrap">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product) => (
                  <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                    <TableCell className="font-medium text-xs whitespace-nowrap">{product.name}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <Badge variant="outline" className="rounded-none">
                        {normalizeProductCategoryGroup(product.category) || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{resolveProductDetail(product.category, product.unit) || "-"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{`${product.baseDays ?? 0}일`}</TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">{formatPrice(product.workCost ?? 0)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{product.worker || "-"}</TableCell>
                    <TableCell className="text-xs">{product.notes || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Dialog open={editingProduct?.id === product.id} onOpenChange={(open) => !open && setEditingProduct(null)}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-none"
                              onClick={() => handleEdit(product)}
                              data-testid={`button-edit-product-${product.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="rounded-none max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>상품 수정</DialogTitle>
                            </DialogHeader>
                            {productFormJSX}
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-none text-red-500 hover:text-red-600"
                          onClick={() => deleteMutation.mutate(product.id)}
                          data-testid={`button-delete-product-${product.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => {
            setPageSize(parseInt(value));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-auto min-w-[120px] rounded-none h-9" data-testid="select-page-size">
            <SelectValue placeholder={`${pageSize}개씩 보기`} />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="10">10개씩 보기</SelectItem>
            <SelectItem value="20">20개씩 보기</SelectItem>
            <SelectItem value="50">50개씩 보기</SelectItem>
          </SelectContent>
        </Select>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
}


