import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = useMemo(() => {
    const result: (number | "ellipsis-start" | "ellipsis-end")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) result.push(i);
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) result.push(i);
        result.push("ellipsis-end");
        result.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        result.push(1);
        result.push("ellipsis-start");
        for (let i = totalPages - 4; i <= totalPages; i++) result.push(i);
      } else {
        result.push(1);
        result.push("ellipsis-start");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) result.push(i);
        result.push("ellipsis-end");
        result.push(totalPages);
      }
    }
    return result;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center gap-1" data-testid="pagination">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        data-testid="button-prev-page"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      {pages.map((page, idx) =>
        typeof page === "string" ? (
          <span key={page} className="px-2 text-muted-foreground text-sm select-none">...</span>
        ) : (
          <Button
            key={page}
            variant={page === currentPage ? "default" : "outline"}
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={() => onPageChange(page)}
            data-testid={`button-page-${page}`}
          >
            {page}
          </Button>
        )
      )}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-none"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        data-testid="button-next-page"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
