import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Search, Trash2, Eye, Printer, X } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import type { Quotation, Product, QuotationItem } from "@shared/schema";

const companyLogoImg = "/favicon.png";
const user = {} as { department?: string } | null;
const products: Product[] = [];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDate(dateStr: string | Date): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function isRegionalCategory(value: unknown): boolean {
  return String(value || "").replace(/\s+/g, "").includes("타지역");
}

interface DetailLine {
  description: string;
  quantity: number;
  unitPrice: number;
  unitPriceText: string;
  amount: number;
  remark: string;
}

interface SubGroup {
  name: string;
  lines: DetailLine[];
}

interface ProductGroup {
  productName: string;
  vatType: string;
  subGroups: SubGroup[];
}

interface QuotationFormData {
  quotationNumber: string;
  quotationDate: string;
  validUntil: string;
  customerName: string;
  customerCompany: string;
  customerPhone: string;
  customerEmail: string;
  projectName: string;
  bankType: string;
  productGroups: ProductGroup[];
  notes: string;
}

const emptyLine: DetailLine = { description: "", quantity: 1, unitPrice: 0, unitPriceText: "", amount: 0, remark: "" };
const emptySubGroup: SubGroup = { name: "", lines: [{ ...emptyLine }] };
const emptyProductGroup: ProductGroup = { productName: "", vatType: "부가세별도", subGroups: [{ ...emptySubGroup, lines: [{ ...emptyLine }] }] };

function formGroupsToItems(groups: ProductGroup[]): QuotationItem[] {
  const items: QuotationItem[] = [];
  for (const pg of groups) {
    for (const sg of pg.subGroups) {
      for (const line of sg.lines) {
        items.push({
          productName: pg.productName,
          category: sg.name,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceText: line.unitPriceText || "",
          amount: line.amount,
          vatType: pg.vatType,
          remark: line.remark,
        });
      }
    }
  }
  return items;
}

function itemsToFormGroups(items: QuotationItem[]): ProductGroup[] {
  const groups: ProductGroup[] = [];
  for (const item of items) {
    let pg = groups[groups.length - 1];
    if (!pg || pg.productName !== item.productName) {
      pg = { productName: item.productName, vatType: item.vatType || "부가세별도", subGroups: [] };
      groups.push(pg);
    }
    let sg = pg.subGroups[pg.subGroups.length - 1];
    if (!sg || sg.name !== (item.category || "")) {
      sg = { name: item.category || "", lines: [] };
      pg.subGroups.push(sg);
    }
    sg.lines.push({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitPriceText: (item as any).unitPriceText || "",
      amount: item.amount,
      remark: item.remark || "",
    });
  }
  return groups.length > 0 ? groups : [{ ...emptyProductGroup, subGroups: [{ ...emptySubGroup, lines: [{ ...emptyLine }] }] }];
}

function getInitialFormData(): QuotationFormData {
  const today = new Date().toISOString().split("T")[0];
  const validDate = new Date();
  validDate.setDate(validDate.getDate() + 14);
  return {
    quotationNumber: "",
    quotationDate: today,
    validUntil: validDate.toISOString().split("T")[0],
    customerName: "",
    customerCompany: "",
    customerPhone: "",
    customerEmail: "",
    projectName: "",
    bankType: "bank1",
    productGroups: [{ ...emptyProductGroup, subGroups: [{ ...emptySubGroup, lines: [{ ...emptyLine }] }] }],
    notes: "1. 귀사의 무궁한 발전을 기원합니다.\n2. 본 견적서는 견적일로부터 14일간 유효합니다.\n3. 포털사이트(네이버/인스타그램) 로직 변경시, 작업 방식에 일부 변경될 수 있습니다.\n4. 프로젝트 종료 해지 시, 잔사 환불은 요금에 따라 위약금이 발생할 수 있습니다.\n5. 프로젝트 결과물을 주식회사 어스루프의 포트폴리오 자료로 활용될 수 있습니다.",
  };
}

export default function QuotationsPage() {
  const { toast } = useToast();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formPreview, setFormPreview] = useState(false);
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);
  const [formData, setFormData] = useState<QuotationFormData>(getInitialFormData());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: quotationsList = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const availableProducts: Product[] = user?.department === "타지역팀"
    ? products.filter((product) => isRegionalCategory(product.category))
    : products;

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/quotations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      setIsFormOpen(false);
      setFormData(getInitialFormData());
      toast({ title: "견적서가 생성되었습니다." });
    },
    onError: () => {
      toast({ title: "견적서 생성에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/quotations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: "견적서가 삭제되었습니다." });
    },
  });

  const flatItems = formGroupsToItems(formData.productGroups);

  const calculateTotals = (items: QuotationItem[]) => {
    let subtotal = 0;
    let vatAmount = 0;
    for (const item of items) {
      subtotal += item.amount;
      if (item.vatType === "부가세별도") {
        vatAmount += Math.round(item.amount * 0.1);
      }
    }
    return { subtotal, vatAmount, totalAmount: subtotal + vatAmount };
  };

  const updateGroups = (newGroups: ProductGroup[]) => {
    setFormData({ ...formData, productGroups: newGroups });
  };

  const addProductGroup = () => {
    updateGroups([...formData.productGroups, { productName: "", vatType: "부가세별도", subGroups: [{ name: "", lines: [{ ...emptyLine }] }] }]);
  };

  const removeProductGroup = (pgIdx: number) => {
    if (formData.productGroups.length <= 1) return;
    updateGroups(formData.productGroups.filter((_, i) => i !== pgIdx));
  };

  const updateProductGroupField = (pgIdx: number, field: string, value: string) => {
    const newGroups = [...formData.productGroups];
    (newGroups[pgIdx] as any)[field] = value;
    if (field === "productName") {
      const matchedProduct = availableProducts.find(p => p.name === value);
      if (matchedProduct) {
        newGroups[pgIdx].vatType = matchedProduct.vatType || "부가세별도";
        for (let sgIdx = 0; sgIdx < newGroups[pgIdx].subGroups.length; sgIdx++) {
          const sg = newGroups[pgIdx].subGroups[sgIdx];
          for (let lineIdx = 0; lineIdx < sg.lines.length; lineIdx++) {
            if (sg.lines[lineIdx].unitPrice === 0) {
              sg.lines[lineIdx] = {
                ...sg.lines[lineIdx],
                unitPrice: matchedProduct.unitPrice,
                amount: sg.lines[lineIdx].quantity * matchedProduct.unitPrice,
              };
            }
          }
        }
      }
    }
    updateGroups(newGroups);
  };

  const addSubGroup = (pgIdx: number) => {
    const newGroups = [...formData.productGroups];
    newGroups[pgIdx] = { ...newGroups[pgIdx], subGroups: [...newGroups[pgIdx].subGroups, { name: "", lines: [{ ...emptyLine }] }] };
    updateGroups(newGroups);
  };

  const removeSubGroup = (pgIdx: number, sgIdx: number) => {
    const newGroups = [...formData.productGroups];
    if (newGroups[pgIdx].subGroups.length <= 1) return;
    newGroups[pgIdx] = { ...newGroups[pgIdx], subGroups: newGroups[pgIdx].subGroups.filter((_, i) => i !== sgIdx) };
    updateGroups(newGroups);
  };

  const updateSubGroupName = (pgIdx: number, sgIdx: number, value: string) => {
    const newGroups = [...formData.productGroups];
    newGroups[pgIdx] = { ...newGroups[pgIdx], subGroups: [...newGroups[pgIdx].subGroups] };
    newGroups[pgIdx].subGroups[sgIdx] = { ...newGroups[pgIdx].subGroups[sgIdx], name: value };
    updateGroups(newGroups);
  };

  const addDetailLine = (pgIdx: number, sgIdx: number) => {
    const newGroups = [...formData.productGroups];
    newGroups[pgIdx] = { ...newGroups[pgIdx], subGroups: [...newGroups[pgIdx].subGroups] };
    newGroups[pgIdx].subGroups[sgIdx] = { ...newGroups[pgIdx].subGroups[sgIdx], lines: [...newGroups[pgIdx].subGroups[sgIdx].lines, { ...emptyLine }] };
    updateGroups(newGroups);
  };

  const removeDetailLine = (pgIdx: number, sgIdx: number, lineIdx: number) => {
    const newGroups = [...formData.productGroups];
    const sg = newGroups[pgIdx].subGroups[sgIdx];
    if (sg.lines.length <= 1) return;
    newGroups[pgIdx] = { ...newGroups[pgIdx], subGroups: [...newGroups[pgIdx].subGroups] };
    newGroups[pgIdx].subGroups[sgIdx] = { ...sg, lines: sg.lines.filter((_, i) => i !== lineIdx) };
    updateGroups(newGroups);
  };

  const updateDetailLine = (pgIdx: number, sgIdx: number, lineIdx: number, field: keyof DetailLine, value: any) => {
    const newGroups = [...formData.productGroups];
    newGroups[pgIdx] = { ...newGroups[pgIdx], subGroups: [...newGroups[pgIdx].subGroups] };
    const sg = { ...newGroups[pgIdx].subGroups[sgIdx], lines: [...newGroups[pgIdx].subGroups[sgIdx].lines] };
    sg.lines[lineIdx] = { ...sg.lines[lineIdx], [field]: value };
    if (field === "quantity" || field === "unitPrice") {
      sg.lines[lineIdx].amount = sg.lines[lineIdx].quantity * sg.lines[lineIdx].unitPrice;
    }
    newGroups[pgIdx].subGroups[sgIdx] = sg;
    updateGroups(newGroups);
  };

  const openNewForm = async () => {
    try {
      const res = await fetch("/api/quotations/next-number");
      const data = await res.json();
      const newData = getInitialFormData();
      newData.quotationNumber = data.quotationNumber;
      setFormData(newData);
      setIsFormOpen(true);
    } catch {
      const newData = getInitialFormData();
      newData.quotationNumber = `Q${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-001`;
      setFormData(newData);
      setIsFormOpen(true);
    }
  };

  const handleSubmit = () => {
    if (!formData.customerName.trim()) {
      toast({ title: "고객명을 입력해주세요.", variant: "destructive" });
      return;
    }
    const items = formGroupsToItems(formData.productGroups);
    if (items.length === 0 || !items[0].productName) {
      toast({ title: "상품을 하나 이상 추가해주세요.", variant: "destructive" });
      return;
    }
    const totals = calculateTotals(items);
    createMutation.mutate({
      quotationNumber: formData.quotationNumber,
      quotationDate: formData.quotationDate,
      validUntil: formData.validUntil || null,
      customerName: formData.customerName,
      customerCompany: formData.customerCompany || null,
      customerPhone: formData.customerPhone || null,
      customerEmail: formData.customerEmail || null,
      projectName: formData.projectName || null,
      bankType: formData.bankType || "bank1",
      items,
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      totalAmount: totals.totalAmount,
      notes: formData.notes || null,
    });
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const styleEl = printContent.querySelector("style");
    const styleContent = styleEl ? styleEl.textContent || "" : "";
    const bodyContent = printContent.innerHTML.replace(/<style[\s\S]*?<\/style>/gi, "");
    const htmlContent = `<!DOCTYPE html><html><head><title>\uACAC\uC801\uC11C - ${previewQuotation?.quotationNumber || ""}</title><style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800;900&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Noto Sans KR',sans-serif;color:#1a1a1a;background:#fff;}.no-print{display:none !important;}${styleContent}</style></head><body>${bodyContent}</body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 500);
  };

  const filteredQuotations = quotationsList.filter((q) => {
    const term = searchTerm.toLowerCase();
    return (
      q.quotationNumber.toLowerCase().includes(term) ||
      q.customerName.toLowerCase().includes(term) ||
      (q.customerCompany || "").toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(filteredQuotations.length / pageSize);
  const paginatedQuotations = filteredQuotations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totals = calculateTotals(flatItems);

  const renderPrintPreview = (q: Quotation) => {
    let items: QuotationItem[] = [];
    try {
      items = typeof q.items === "string" ? JSON.parse(q.items) : q.items;
    } catch { items = []; }

    const grouped: { [pn: string]: QuotationItem[] } = {};
    for (const item of items) {
      const pn = item.productName || "\uAE30\uD0C0";
      if (!grouped[pn]) grouped[pn] = [];
      grouped[pn].push(item);
    }
    const productNames = Object.keys(grouped);

    const bt = q.bankType || "bank1";
    const prefix = bt === "bank2" ? "bank2" : "bank1";
    const supplierName = settings[`${prefix}_supplier_name`] || settings.company_name || "EARTHLOOP";
    const supplierBusinessNum = settings[`${prefix}_supplier_business_number`] || settings.company_business_number || "";
    const supplierCeo = settings[`${prefix}_supplier_ceo`] || settings.company_ceo || "";
    const bankName = settings[`${prefix}_name`] || "";
    const bankAccount = settings[`${prefix}_account`] || "";
    const bankHolder = settings[`${prefix}_holder`] || "";
    const companyPhone = settings.company_phone || "";
    const companyMainPhone = settings.company_main_phone || companyPhone;
    const companyEmail = settings.company_email || "";
    const companyAddress = settings.company_address || "";
    const bankLine = bankName && bankAccount
      ? `${bankName} / ${bankAccount} / ${bankHolder || supplierName}`
      : "";

    const buildItemRows = (pnItems: QuotationItem[], pnIdx: number) => {
      const rows: any[] = [];
      const subGroups: { name: string; items: QuotationItem[] }[] = [];
      for (const item of pnItems) {
        const subName = item.category || "";
        const last = subGroups[subGroups.length - 1];
        if (last && last.name === subName) {
          last.items.push(item);
        } else {
          subGroups.push({ name: subName, items: [item] });
        }
      }

      subGroups.forEach((sg) => {
        const priceGroups: { leader: QuotationItem; followers: QuotationItem[] }[] = [];
        for (const item of sg.items) {
          const hasPrice = item.unitPrice > 0 || (item as any).unitPriceText;
          if (hasPrice || priceGroups.length === 0) {
            priceGroups.push({ leader: item, followers: [] });
          } else {
            priceGroups[priceGroups.length - 1].followers.push(item);
          }
        }

        let sgItemIdx = 0;
        priceGroups.forEach((pg) => {
          const groupSize = 1 + pg.followers.length;
          const allItems = [pg.leader, ...pg.followers];
          const groupAmount = allItems.reduce((sum, it) => sum + it.amount, 0);
          const priceText = (pg.leader as any).unitPriceText || "";
          const isServiceText = priceText && isNaN(parseInt(priceText));

          allItems.forEach((item, innerIdx) => {
            const globalIdx = sgItemIdx;
            sgItemIdx++;
            const descDisplay = item.description
              ? (item.description.startsWith("- ") ? item.description : `- ${item.description}`)
              : "";
            const showSubCell = sg.name && globalIdx === 0;
            const isFirstInGroup = innerIdx === 0;

            rows.push(
              <tr key={`${pnIdx}-${sg.name}-${globalIdx}`}>
                <td></td>
                {showSubCell && (
                  <td rowSpan={sg.items.length} style={{ verticalAlign: "middle", fontWeight: 600, fontSize: "11px", lineHeight: 1.5, padding: "6px 8px" }}>
                    {sg.name}
                  </td>
                )}
                {!sg.name && globalIdx === 0 && <td rowSpan={sg.items.length}></td>}
                <td style={{ fontSize: "11px", color: "#333", padding: "3px 6px" }}>{descDisplay}</td>
                {isFirstInGroup ? (
                  <>
                    <td rowSpan={groupSize} className="text-right" style={{ verticalAlign: "middle" }}>
                      {isServiceText ? priceText : (pg.leader.unitPrice > 0 ? formatCurrency(pg.leader.unitPrice) : "")}
                    </td>
                    <td rowSpan={groupSize} className="text-center" style={{ verticalAlign: "middle" }}>
                      {!isServiceText && pg.leader.quantity > 0 && pg.leader.unitPrice > 0 ? pg.leader.quantity : ""}
                    </td>
                    <td rowSpan={groupSize} className="text-right" style={{ whiteSpace: "nowrap", verticalAlign: "middle" }}>
                      {isServiceText ? (
                        <span style={{ color: "#888" }}>0</span>
                      ) : groupAmount > 0 ? (
                        <>{"\u20A9"} {formatCurrency(groupAmount)}</>
                      ) : ""}
                    </td>
                    <td rowSpan={groupSize} className="text-center" style={{ fontSize: "10px", verticalAlign: "middle" }}>
                      {pg.leader.remark || ""}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          });
        });
      });
      return rows;
    };

    return (
      <div ref={printRef}>
        <style>{`
          .q-page { width: 100%; max-width: 1000px; margin: 0 auto; font-family: 'Noto Sans KR', 'Manrope', sans-serif; font-size: 13px; line-height: 1.5; color: #222; background: #fff; }
          .q-header-bar { background: #203764; height: 4px; width: 100%; }
          .q-header { display: flex; justify-content: space-between; align-items: stretch; background: #203764; border-bottom: 2px solid #203764; }
          .q-header-left { flex: 1; padding: 14px 20px 10px; }
          .q-header-left h1 { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: 2px; margin: 0 0 4px; }
          .q-header-left p { font-size: 13px; color: rgba(255,255,255,0.85); margin: 0; font-weight: 500; }
          .q-header-right { background: #203764; color: #fff; padding: 18px 36px; font-size: 30px; font-weight: 800; letter-spacing: 8px; display: flex; align-items: center; }
          .q-info-wrap { padding: 10px 0 6px; }
          .q-info-table { width: 100%; border-collapse: collapse; }
          .q-info-table td { padding: 6px 12px; font-size: 13px; border: 1px solid #ccc; }
          .q-info-table .lbl { background: #203764; font-weight: 600; width: 80px; color: #fff; white-space: nowrap; text-align: center; }
          .q-info-table .val { min-width: 160px; }
          .q-info-table .gap-cell { border: none; width: 30px; }
          .q-info-table .sup-lbl { background: #203764; color: #fff; font-weight: 600; width: 60px; text-align: center; white-space: nowrap; font-size: 14px; letter-spacing: 2px; }
          .q-info-table .sup-sub-lbl { background: #203764; color: #fff; font-weight: 600; width: 75px; text-align: center; white-space: nowrap; font-size: 12px; }
          .q-info-table .sup-val { min-width: 130px; }
          .q-greeting { text-align: center; color: #c00; font-size: 13px; font-weight: 500; margin: 6px 0; padding: 6px 0; border-top: 2px solid #203764; border-bottom: 1px solid #ddd; }
          .q-items-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 2px; }
          .q-items-table th { background: #e8eaf0; padding: 7px 6px; text-align: center; border: 1px solid #bbb; font-weight: 700; font-size: 12.5px; color: #333; }
          .q-items-table td { padding: 5px 6px; border: 1px solid #ccc; vertical-align: middle; }
          .q-items-table .text-right { text-align: right; }
          .q-items-table .text-center { text-align: center; }
          .q-cat-row td { background: #f0f2f8; font-weight: 700; border: 1px solid #bbb; }
          .q-cat-num { color: #203764; font-weight: 800; font-size: 14px; }
          .q-cat-name { font-weight: 800; color: #203764; font-size: 13px; text-decoration: underline; }
          .q-notes-section { margin-top: 8px; border: 1px solid #ccc; }
          .q-notes-header { background: #e8eaf0; padding: 6px 12px; font-weight: 700; font-size: 13px; color: #333; border-bottom: 1px solid #ccc; }
          .q-notes-body { padding: 8px 12px; font-size: 12px; line-height: 1.8; white-space: pre-wrap; color: #333; }
          .q-footer { margin-top: 10px; }
          .q-bank-line { background: #203764; color: #fff; padding: 8px 14px; font-size: 13px; font-weight: 500; text-align: center; letter-spacing: 0.5px; }
          .q-footer-bottom { display: flex; justify-content: space-between; align-items: stretch; margin-top: 8px; gap: 12px; }
          .q-footer-left { flex: 1; border: 1px solid #ccc; }
          .q-footer-left-top { display: flex; align-items: center; gap: 12px; padding: 10px 12px; }
          .q-logo-box { width: 80px; min-width: 80px; height: 90px; display: flex; align-items: center; justify-content: center; }
          .q-logo-box svg { width: 72px; height: 80px; }
          .q-contact-info { font-size: 13px; line-height: 1.9; color: #333; }
          .q-contact-info b { font-weight: 700; color: #222; }
          .q-totals-box { border: 1px solid #ccc; min-width: 260px; }
          .q-totals-row { display: flex; border-bottom: 1px solid #ccc; }
          .q-totals-row:last-child { border-bottom: none; }
          .q-totals-label { background: #e8eaf0; padding: 8px 14px; font-weight: 700; font-size: 14px; width: 85px; text-align: center; color: #333; display: flex; align-items: center; justify-content: center; }
          .q-totals-value { padding: 8px 14px; font-weight: 700; font-size: 15px; text-align: right; flex: 1; display: flex; align-items: center; justify-content: flex-end; }
          .q-totals-row.total .q-totals-label { background: #203764; color: #fff; }
          .q-totals-row.total .q-totals-value { font-size: 17px; font-weight: 800; color: #203764; }
          @page { size: A4; margin: 15mm 18mm; }
          @media print {
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .q-page { max-width: 100%; }
          }
        `}</style>
        <div className="q-page">
          <div className="q-header-bar"></div>
          <div className="q-header">
            <div className="q-header-left">
              <h1>{supplierName}</h1>
              <p>{"\uC138\uBD80\uB0B4\uC5ED \uBC0F \uAE08\uC561\uC0B0\uCD9C \uACAC\uC801\uC11C"}</p>
            </div>
            <div className="q-header-right">{"\uACAC\uC801\uC11C"}</div>
          </div>

          <div className="q-info-wrap">
            <table className="q-info-table">
              <tbody>
                <tr>
                  <td className="lbl">Client</td>
                  <td className="val">{q.customerName}{q.customerCompany ? `(${q.customerCompany})` : ""}</td>
                  <td className="gap-cell" rowSpan={3}></td>
                  <td className="sup-lbl" rowSpan={3}>{"\uACF5\uAE09\uC790"}</td>
                  <td className="sup-sub-lbl">{"\uC0AC\uC5C5\uC790\uBC88\uD638"}</td>
                  <td className="sup-val">{supplierBusinessNum}</td>
                </tr>
                <tr>
                  <td className="lbl">Project</td>
                  <td className="val">{q.projectName || "-"}</td>
                  <td className="sup-sub-lbl">{"\uC0C1\uD638\uBA85"}</td>
                  <td className="sup-val">{supplierName}</td>
                </tr>
                <tr>
                  <td className="lbl">Date</td>
                  <td className="val">{formatDate(q.quotationDate)}</td>
                  <td className="sup-sub-lbl">{"\uB300\uD45C"}</td>
                  <td className="sup-val">{supplierCeo}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="q-greeting">{"\uB2E4\uC74C\uACFC \uAC19\uC774 \uACAC\uC801\uD569\uB2C8\uB2E4."}</div>

          <table className="q-items-table">
            <thead>
              <tr>
                <th style={{ width: "36px" }}>NO.</th>
                <th style={{ width: "130px" }}>{"\uAD6C\uBD84"}</th>
                <th>{"\uC0C1\uC138\uB0B4\uC5ED"}</th>
                <th style={{ width: "70px" }}>{"\uB2E8\uAC00"}</th>
                <th style={{ width: "40px" }}>{"\uC218\uB7C9"}</th>
                <th style={{ width: "85px" }}>{"\uD569\uACC4"}</th>
                <th style={{ width: "50px" }}>{"\uBE44\uACE0"}</th>
              </tr>
            </thead>
            <tbody>
              {productNames.map((pn, pnIdx) => {
                const pnItems = grouped[pn];
                const pnTotal = pnItems.reduce((sum, it) => sum + it.amount, 0);
                const rows: any[] = [];
                rows.push(
                  <tr key={`pn-${pnIdx}`} className="q-cat-row">
                    <td className="text-center">
                      <span className="q-cat-num">{pnIdx + 1}</span>
                    </td>
                    <td colSpan={4} style={{ paddingLeft: "10px" }}>
                      <span className="q-cat-name">{pn}</span>
                    </td>
                    <td className="text-right" style={{ fontWeight: 700, color: "#203764", whiteSpace: "nowrap" }}>
                      {"\u20A9"} {formatCurrency(pnTotal)}
                    </td>
                    <td></td>
                  </tr>
                );
                rows.push(...buildItemRows(pnItems, pnIdx));
                return rows;
              })}
            </tbody>
          </table>

          {q.notes && (
            <div className="q-notes-section">
              <div className="q-notes-header">{"\uBE44\uACE0"}</div>
              <div className="q-notes-body">{q.notes}</div>
            </div>
          )}

          <div className="q-footer">
            <div className="q-bank-line">
              {bankLine
                ? `\uACC4\uC88C\uC815\uBCF4 : ${bankLine}  |  \uB300\uD45C\uBC88\uD638 : ${companyMainPhone}`
                : `\uB300\uD45C\uBC88\uD638 : ${companyMainPhone}`}
            </div>
            <div className="q-footer-bottom">
              <div className="q-footer-left">
                <div className="q-footer-left-top">
                  <div className="q-logo-box">
                    <img src={companyLogoImg} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                  <div className="q-contact-info">
                    {(() => {
                      const creatorUser = users.find((u: any) => u.id === q.createdById);
                      const cEmail = (q as any).createdByEmail || creatorUser?.email || "";
                      const cPhone = (q as any).createdByPhone || creatorUser?.phone || "";
                      return (
                        <>
                          <div><b>담당자 :</b> {q.createdByName}</div>
                          {cEmail && <div><b>이메일 :</b> {cEmail}</div>}
                          {cPhone && <div><b>연락처 :</b> {cPhone}</div>}
                          {companyAddress && <div><b>주소 :</b> {companyAddress}</div>}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="q-totals-box">
                <div className="q-totals-row">
                  <div className="q-totals-label">{"\uD569\uACC4"}</div>
                  <div className="q-totals-value">{"\u20A9"} {formatCurrency(q.subtotal)}</div>
                </div>
                <div className="q-totals-row">
                  <div className="q-totals-label">{"\uBD80\uAC00\uC138"}</div>
                  <div className="q-totals-value">{"\u20A9"} {formatCurrency(q.vatAmount)}</div>
                </div>
                <div className="q-totals-row total">
                  <div className="q-totals-label">{"\uCD1D\uD569\uACC4"}</div>
                  <div className="q-totals-value">{"\u20A9"} {formatCurrency(q.totalAmount)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">견적서</h1>
          <Badge variant="secondary" data-testid="badge-count">{filteredQuotations.length}건</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="검색 (번호, 고객명, 회사명)"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-9 w-64"
              data-testid="input-search"
            />
          </div>
          <Button onClick={openNewForm} data-testid="button-new-quotation">
            <Plus className="w-4 h-4 mr-1" />
            견적서 작성
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">견적번호</TableHead>
                <TableHead className="w-[110px]">견적일</TableHead>
                <TableHead>고객명</TableHead>
                <TableHead>회사명</TableHead>
                <TableHead>프로젝트</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead className="w-[110px]">유효기한</TableHead>
                <TableHead>작성자</TableHead>
                <TableHead className="w-[100px] text-center">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">로딩 중...</TableCell>
                </TableRow>
              ) : paginatedQuotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">견적서가 없습니다.</TableCell>
                </TableRow>
              ) : (
                paginatedQuotations.map((q) => (
                  <TableRow key={q.id} data-testid={`row-quotation-${q.id}`}>
                    <TableCell className="font-mono text-sm">{q.quotationNumber}</TableCell>
                    <TableCell className="text-sm">{formatDate(q.quotationDate)}</TableCell>
                    <TableCell className="font-medium">{q.customerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.customerCompany || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.projectName || "-"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(q.totalAmount)}원</TableCell>
                    <TableCell className="text-sm">{q.validUntil ? formatDate(q.validUntil) : "-"}</TableCell>
                    <TableCell className="text-sm">{q.createdByName}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setPreviewQuotation(q)}
                          data-testid={`button-preview-${q.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("이 견적서를 삭제하시겠습니까?")) {
                              deleteMutation.mutate(q.id);
                            }
                          }}
                          data-testid={`button-delete-${q.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setFormPreview(false); }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>

            <DialogTitle className="flex items-center gap-3 pr-8 flex-wrap">
              <span>{formPreview ? "견적서 미리보기" : "견적서 작성"}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormPreview(!formPreview)}
                data-testid="button-toggle-form-preview"
              >
                {formPreview ? (<><X className="w-4 h-4 mr-1" />편집으로 돌아가기</>) : (<><Eye className="w-4 h-4 mr-1" />미리보기</>)}
              </Button>
            </DialogTitle>
          </DialogHeader>
          {formPreview ? (
            (() => {
              const items = formGroupsToItems(formData.productGroups);
              const t = calculateTotals(items);
              const tempQ: any = {
                id: "temp",
                quotationNumber: formData.quotationNumber,
                quotationDate: new Date(formData.quotationDate),
                validUntil: formData.validUntil ? new Date(formData.validUntil) : null,
                customerName: formData.customerName,
                customerCompany: formData.customerCompany,
                customerPhone: formData.customerPhone,
                customerEmail: formData.customerEmail,
                projectName: formData.projectName,
                bankType: formData.bankType,
                items: JSON.stringify(items),
                subtotal: t.subtotal,
                vatAmount: t.vatAmount,
                totalAmount: t.totalAmount,
                notes: formData.notes,
                createdById: null,
                createdByName: "미리보기",
                createdByEmail: "",
                createdByPhone: "",
                createdAt: new Date(),
              };
              return renderPrintPreview(tempQ);
            })()
          ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>견적번호</Label>
                <Input value={formData.quotationNumber} readOnly className="bg-muted" data-testid="input-quotation-number" />
              </div>
              <div className="space-y-2">
                <Label>견적일</Label>
                <Input
                  type="date"
                  value={formData.quotationDate}
                  onChange={(e) => setFormData({ ...formData, quotationDate: e.target.value })}
                  data-testid="input-quotation-date"
                />
              </div>
              <div className="space-y-2">
                <Label>유효기한</Label>
                <Input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  data-testid="input-valid-until"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">고객 정보</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>고객명 (Client) *</Label>
                  <Input
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    placeholder="고객명 입력"
                    data-testid="input-customer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>회사명</Label>
                  <Input
                    value={formData.customerCompany}
                    onChange={(e) => setFormData({ ...formData, customerCompany: e.target.value })}
                    placeholder="회사명 입력"
                    data-testid="input-customer-company"
                  />
                </div>
                <div className="space-y-2">
                  <Label>프로젝트 (Project)</Label>
                  <Input
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    placeholder="프로젝트명 입력"
                    data-testid="input-project-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>계좌 (공급자)</Label>
                  <Select value={formData.bankType} onValueChange={(v) => setFormData({ ...formData, bankType: v })}>
                    <SelectTrigger className="rounded-none" data-testid="select-bank-type">
                      <SelectValue placeholder="계좌 선택" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="bank1">{settings.bank1_name || "하나은행"} - {settings.bank1_supplier_name || "공급자1"}</SelectItem>
                      <SelectItem value="bank2">{settings.bank2_name || "국민은행"} - {settings.bank2_supplier_name || "공급자2"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>전화번호</Label>
                  <Input
                    value={formData.customerPhone}
                    onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                    placeholder="전화번호 입력"
                    data-testid="input-customer-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label>이메일</Label>
                  <Input
                    value={formData.customerEmail}
                    onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                    placeholder="이메일 입력"
                    data-testid="input-customer-email"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="font-semibold">상품 항목</h3>
                <Button variant="outline" size="sm" onClick={addProductGroup} data-testid="button-add-product-group">
                  <Plus className="w-4 h-4 mr-1" />
                  상품 추가
                </Button>
              </div>

              <div className="space-y-4">
                {formData.productGroups.map((pg, pgIdx) => {
                  const pgTotal = pg.subGroups.reduce((s, sg) => s + sg.lines.reduce((ls, l) => ls + l.amount, 0), 0);
                  return (
                    <Card key={pgIdx} className="border-2">
                      <CardContent className="p-3 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                            <Label className="whitespace-nowrap font-bold text-sm">상품명</Label>
                            <Input
                              value={pg.productName}
                              onChange={(e) => updateProductGroupField(pgIdx, "productName", e.target.value)}
                              placeholder="상품명 입력"
                              className="font-semibold"
                              data-testid={`input-product-name-${pgIdx}`}
                              list={`product-list-${pgIdx}`}
                            />
                            <datalist id={`product-list-${pgIdx}`}>
                              {availableProducts.filter(p => p.isActive).map((p) => (
                                <option key={p.id} value={p.name} />
                              ))}
                            </datalist>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="whitespace-nowrap no-default-active-elevate">
                              합계: {formatCurrency(pgTotal)}원
                            </Badge>
                            {formData.productGroups.length > 1 && (
                              <Button size="icon" variant="ghost" onClick={() => removeProductGroup(pgIdx)} data-testid={`button-remove-pg-${pgIdx}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {pg.subGroups.map((sg, sgIdx) => (
                          <div key={sgIdx} className="ml-2 border-l-2 border-muted pl-3 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Label className="whitespace-nowrap text-sm">구분</Label>
                              <Input
                                value={sg.name}
                                onChange={(e) => updateSubGroupName(pgIdx, sgIdx, e.target.value)}
                                placeholder="구분 입력 (수기)"
                                className="max-w-[250px]"
                                data-testid={`input-subgroup-${pgIdx}-${sgIdx}`}
                              />
                              <Button variant="outline" size="sm" onClick={() => addDetailLine(pgIdx, sgIdx)} data-testid={`button-add-line-${pgIdx}-${sgIdx}`}>
                                <Plus className="w-3 h-3 mr-1" />
                                내역 추가
                              </Button>
                              {pg.subGroups.length > 1 && (
                                <Button size="icon" variant="ghost" onClick={() => removeSubGroup(pgIdx, sgIdx)} data-testid={`button-remove-sg-${pgIdx}-${sgIdx}`}>
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>

                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[35%]">상세내역</TableHead>
                                  <TableHead className="w-[15%]">단가</TableHead>
                                  <TableHead className="w-[10%]">수량</TableHead>
                                  <TableHead className="w-[15%]">금액</TableHead>
                                  <TableHead className="w-[18%]">비고</TableHead>
                                  <TableHead className="w-[40px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sg.lines.map((line, lineIdx) => (
                                  <TableRow key={lineIdx}>
                                    <TableCell>
                                      <Input
                                        value={line.description}
                                        onChange={(e) => updateDetailLine(pgIdx, sgIdx, lineIdx, "description", e.target.value)}
                                        placeholder="상세내역 입력"
                                        data-testid={`input-desc-${pgIdx}-${sgIdx}-${lineIdx}`}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={line.unitPriceText || (line.unitPrice > 0 ? String(line.unitPrice) : "")}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const num = parseInt(val);
                                          const newGroups = [...formData.productGroups];
                                          newGroups[pgIdx] = { ...newGroups[pgIdx], subGroups: [...newGroups[pgIdx].subGroups] };
                                          const sg = { ...newGroups[pgIdx].subGroups[sgIdx], lines: [...newGroups[pgIdx].subGroups[sgIdx].lines] };
                                          const updatedLine = { ...sg.lines[lineIdx] };
                                          if (!isNaN(num) && String(num) === val.trim()) {
                                            updatedLine.unitPrice = num;
                                            updatedLine.unitPriceText = "";
                                            updatedLine.amount = updatedLine.quantity * num;
                                          } else {
                                            updatedLine.unitPriceText = val;
                                            updatedLine.unitPrice = 0;
                                            updatedLine.amount = 0;
                                          }
                                          sg.lines[lineIdx] = updatedLine;
                                          newGroups[pgIdx].subGroups[sgIdx] = sg;
                                          updateGroups(newGroups);
                                        }}
                                        placeholder="단가 / 서비스"
                                        data-testid={`input-price-${pgIdx}-${sgIdx}-${lineIdx}`}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        min={1}
                                        value={line.quantity}
                                        onChange={(e) => updateDetailLine(pgIdx, sgIdx, lineIdx, "quantity", parseInt(e.target.value) || 1)}
                                        data-testid={`input-qty-${pgIdx}-${sgIdx}-${lineIdx}`}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium text-right text-sm">
                                      {line.amount > 0 ? `${formatCurrency(line.amount)}원` : "-"}
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        value={line.remark}
                                        onChange={(e) => updateDetailLine(pgIdx, sgIdx, lineIdx, "remark", e.target.value)}
                                        placeholder="비고"
                                        data-testid={`input-remark-${pgIdx}-${sgIdx}-${lineIdx}`}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      {sg.lines.length > 1 && (
                                        <Button size="icon" variant="ghost" onClick={() => removeDetailLine(pgIdx, sgIdx, lineIdx)} data-testid={`button-remove-line-${pgIdx}-${sgIdx}-${lineIdx}`}>
                                          <X className="w-4 h-4" />
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ))}

                        <Button variant="outline" size="sm" onClick={() => addSubGroup(pgIdx)} className="ml-2" data-testid={`button-add-subgroup-${pgIdx}`}>
                          <Plus className="w-3 h-3 mr-1" />
                          구분 추가
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-end">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">공급가액</span>
                    <span className="font-medium">{formatCurrency(totals.subtotal)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">부가세</span>
                    <span className="font-medium">{formatCurrency(totals.vatAmount)}원</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-bold">
                    <span>합계</span>
                    <span>{formatCurrency(totals.totalAmount)}원</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <Label>비고</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="비고 입력"
                rows={5}
                data-testid="textarea-notes"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>취소</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit">
                {createMutation.isPending ? "저장 중..." : "견적서 저장"}
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewQuotation} onOpenChange={() => setPreviewQuotation(null)}>
        <DialogContent className="max-w-[1100px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 flex-wrap">
              <span>견적서 미리보기</span>
              <Button onClick={handlePrint} variant="outline" data-testid="button-print">
                <Printer className="w-4 h-4 mr-1" />
                인쇄
              </Button>
            </DialogTitle>
          </DialogHeader>
          {previewQuotation && renderPrintPreview(previewQuotation)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
  const availableProducts = user?.department === "타지역팀"
    ? products.filter((product) => isRegionalCategory(product.category))
    : products;
