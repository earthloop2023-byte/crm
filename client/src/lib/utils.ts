import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ceilAmountFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export function ceilAmount(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.ceil(parsed) : 0
}

export function formatCeilAmount(value: unknown): string {
  return ceilAmountFormatter.format(ceilAmount(value))
}
