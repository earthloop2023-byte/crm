import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Phone, Users, Mail, FileText, MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Activity, InsertActivity, Customer, Deal } from "@shared/schema";
import { useSettings } from "@/lib/settings";

const typeLabels: Record<string, string> = {
  call: "통화",
  meeting: "미팅",
  email: "이메일",
  note: "메모",
};

const typeIcons: Record<string, React.ElementType> = {
  call: Phone,
  meeting: Users,
  email: Mail,
  note: FileText,
};

function ActivityForm({
  customers,
  deals,
  onSuccess,
  onCancel,
}: {
  customers: Customer[];
  deals: Deal[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<InsertActivity>({
    type: "call",
    description: "",
    customerId: null,
    dealId: null,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertActivity) => {
      return apiRequest("POST", "/api/activities", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "활동이 기록되었습니다" });
      onSuccess();
    },
    onError: () => {
      toast({ title: "오류가 발생했습니다", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="type">활동 유형 *</Label>
        <Select
          value={formData.type}
          onValueChange={(value) => setFormData({ ...formData, type: value })}
        >
          <SelectTrigger data-testid="select-activity-type">
            <SelectValue placeholder="유형 선택" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(typeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">내용 *</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="활동 내용을 입력하세요"
          className="min-h-[100px]"
          required
          data-testid="textarea-activity-description"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="customer">관련 고객</Label>
          <Select
            value={formData.customerId || "none"}
            onValueChange={(value) => setFormData({ ...formData, customerId: value === "none" ? null : value })}
          >
            <SelectTrigger data-testid="select-activity-customer">
              <SelectValue placeholder="고객 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택 안함</SelectItem>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="deal">관련 거래</Label>
          <Select
            value={formData.dealId || "none"}
            onValueChange={(value) => setFormData({ ...formData, dealId: value === "none" ? null : value })}
          >
            <SelectTrigger data-testid="select-activity-deal">
              <SelectValue placeholder="거래 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선택 안함</SelectItem>
              {deals.map((deal) => (
                <SelectItem key={deal.id} value={deal.id}>
                  {deal.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
          취소
        </Button>
        <Button type="submit" disabled={createMutation.isPending || !formData.description} data-testid="button-submit-activity">
          {createMutation.isPending ? "저장 중..." : "기록"}
        </Button>
      </div>
    </form>
  );
}

export default function ActivitiesPage() {
  const { toast } = useToast();
  const { formatDateTime } = useSettings();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: activities = [], isLoading: activitiesLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: deals = [], isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/activities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({ title: "활동이 삭제되었습니다" });
    },
    onError: () => {
      toast({ title: "오류가 발생했습니다", variant: "destructive" });
    },
  });

  const getCustomer = (customerId: string | null) =>
    customerId ? customers.find((c) => c.id === customerId) : undefined;

  const getDeal = (dealId: string | null) =>
    dealId ? deals.find((d) => d.id === dealId) : undefined;

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch = activity.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || activity.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const totalPages = Math.ceil(filteredActivities.length / pageSize);
  const paginatedActivities = filteredActivities.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const isLoading = activitiesLoading || customersLoading || dealsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-activities-title">활동 내역</h1>
          <p className="text-muted-foreground">총 {filteredActivities.length}건의 활동</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-activity">
              <Plus className="w-4 h-4 mr-2" />
              활동 기록
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>새 활동 기록</DialogTitle>
            </DialogHeader>
            <ActivityForm
              customers={customers}
              deals={deals}
              onSuccess={() => setIsDialogOpen(false)}
              onCancel={() => setIsDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="활동 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-activities"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-filter-type">
            <SelectValue placeholder="모든 유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 유형</SelectItem>
            {Object.entries(typeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredActivities.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              {search || typeFilter !== "all" ? "검색 결과가 없습니다" : "활동 내역이 없습니다"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {paginatedActivities.map((activity) => {
            const Icon = typeIcons[activity.type] || FileText;
            const customer = getCustomer(activity.customerId);
            const deal = getDeal(activity.dealId);

            return (
              <Card key={activity.id} className="hover-elevate" data-testid={`card-activity-${activity.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {typeLabels[activity.type] || activity.type}
                        </Badge>
                        {customer && (
                          <Badge variant="outline" className="text-xs">
                            {customer.name}
                          </Badge>
                        )}
                        {deal && (
                          <Badge variant="outline" className="text-xs">
                            {deal.title}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {activity.createdAt && formatDateTime(activity.createdAt)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="flex-shrink-0" data-testid={`button-activity-menu-${activity.id}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(activity.id)}
                          data-testid={`button-delete-activity-${activity.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-start">
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
