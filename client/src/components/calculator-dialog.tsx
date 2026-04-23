import { useEffect, useMemo, useState } from "react";
import { Calculator, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const calculatorRows = [
  ["C", "(", ")", "/"],
  ["7", "8", "9", "*"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["0", ".", "%", "="],
] as const;

const allowedExpressionPattern = /^[0-9+\-*/().%\s]+$/;
const directInputKeys = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-", "*", "/", ".", "%", "(", ")"]);

function evaluateExpression(rawExpression: string) {
  const expression = rawExpression.replace(/%/g, "/100");
  if (!expression.trim()) return "";
  if (!allowedExpressionPattern.test(expression)) {
    throw new Error("invalid");
  }

  const result = Function(`"use strict"; return (${expression});`)() as number;
  if (!Number.isFinite(result)) {
    throw new Error("invalid");
  }

  return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(10)));
}

export function CalculatorDialog() {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState("");
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    if (!expression.trim()) return "";
    try {
      return evaluateExpression(expression);
    } catch {
      return "";
    }
  }, [expression]);

  const appendValue = (value: string) => {
    setError("");

    if (value === "=") {
      try {
        setExpression(evaluateExpression(expression));
      } catch {
        setError("계산식이 올바르지 않습니다.");
      }
      return;
    }

    if (value === "C") {
      setExpression("");
      return;
    }

    setExpression((prev) => prev + value);
  };

  const handleDelete = () => {
    setError("");
    setExpression((prev) => prev.slice(0, -1));
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (directInputKeys.has(event.key)) {
        event.preventDefault();
        appendValue(event.key);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        appendValue("=");
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        handleDelete();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        appendValue("C");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, expression]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" data-testid="button-calculator-toggle">
          <Calculator className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[360px] rounded-none p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>계산기</DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5">
          <div className="border rounded-none bg-muted/30 px-4 py-3 mb-4">
            <div className="min-h-6 text-right text-sm text-muted-foreground break-all">{expression || "0"}</div>
            <div className="min-h-8 text-right text-2xl font-semibold break-all">{preview || expression || "0"}</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {calculatorRows.flat().map((value) => (
              <Button
                key={value}
                type="button"
                variant={value === "=" ? "default" : "outline"}
                className="h-12 rounded-none text-base"
                onClick={() => appendValue(value)}
                data-testid={`button-calculator-${value === "=" ? "equals" : value}`}
              >
                {value}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              className="col-span-4 h-12 rounded-none text-base"
              onClick={handleDelete}
              data-testid="button-calculator-delete"
            >
              <Delete className="w-4 h-4 mr-2" />
              지우기
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
