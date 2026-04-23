import { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isWithinInterval,
  isBefore,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getKoreanNow } from "@/lib/korean-time";

interface CustomCalendarProps {
  startDate: Date;
  endDate: Date;
  onSelectStart: (date: Date) => void;
  onSelectEnd: (date: Date) => void;
}

export function CustomCalendar({ startDate, endDate, onSelectStart, onSelectEnd }: CustomCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => getKoreanNow());
  const [selectionMode, setSelectionMode] = useState<"start" | "end">("start");

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDayOfWeek = getDay(monthStart);

  const prevMonthEnd = endOfMonth(subMonths(currentMonth, 1));
  const prevMonthDays: Date[] = [];
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = new Date(prevMonthEnd);
    day.setDate(prevMonthEnd.getDate() - i);
    prevMonthDays.push(day);
  }

  const nextMonthDays: Date[] = [];
  const currentTotal = prevMonthDays.length + days.length;
  const remaining = 7 - (currentTotal % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const day = new Date(monthEnd);
      day.setDate(monthEnd.getDate() + i);
      nextMonthDays.push(day);
    }
  }

  const allDays = [...prevMonthDays, ...days, ...nextMonthDays];

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const normalizedRange = useMemo(() => {
    if (!startDate || !endDate) return null;
    if (startDate <= endDate) return { start: startDate, end: endDate };
    return { start: endDate, end: startDate };
  }, [startDate, endDate]);

  const handleDayClick = (day: Date) => {
    const startOfDay = new Date(day);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);

    if (selectionMode === "start") {
      onSelectStart(startOfDay);
      if (!endDate || isBefore(new Date(endDate), startOfDay)) {
        onSelectEnd(endOfDay);
      }
      setSelectionMode("end");
      return;
    }

    const normalizedStart = new Date(startDate);
    normalizedStart.setHours(0, 0, 0, 0);

    if (isBefore(startOfDay, normalizedStart)) {
      onSelectStart(startOfDay);
      onSelectEnd(endOfDay);
      setSelectionMode("end");
    } else {
      onSelectEnd(endOfDay);
      setSelectionMode("start");
    }
  };

  const isInRange = (day: Date) => {
    if (!normalizedRange) return false;
    return isWithinInterval(day, normalizedRange);
  };

  const isStart = (day: Date) => isSameDay(day, startDate);
  const isEnd = (day: Date) => isSameDay(day, endDate);
  const isCurrentMonth = (day: Date) => day.getMonth() === currentMonth.getMonth();

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  const goToPrevMonth = () => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  return (
    <div className="bg-white p-4 w-[280px]">
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-none h-8 w-8 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
          onClick={goToPrevMonth}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-medium text-slate-900">{format(currentMonth, "yyyy.MM", { locale: ko })}</span>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-none h-8 w-8 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
          onClick={goToNextMonth}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {weekDays.map((day, i) => (
          <div key={i} className="h-8 flex items-center justify-center text-sm text-gray-500">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Button
          type="button"
          variant={selectionMode === "start" ? "default" : "outline"}
          className="h-8 rounded-none text-xs"
          onClick={() => setSelectionMode("start")}
        >
          시작일 선택
        </Button>
        <Button
          type="button"
          variant={selectionMode === "end" ? "default" : "outline"}
          className="h-8 rounded-none text-xs"
          onClick={() => setSelectionMode("end")}
        >
          종료일 선택
        </Button>
      </div>

      <div>
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="flex">
            {week.map((day, dayIdx) => {
              const inRange = isInRange(day);
              const start = isStart(day);
              const end = isEnd(day);
              const current = isCurrentMonth(day);

              return (
                <button
                  key={dayIdx}
                  type="button"
                  className={`h-9 w-10 flex items-center justify-center cursor-pointer
                    ${inRange && !start && !end ? "bg-[#e5e7eb]" : ""}
                    ${start || end ? "bg-[#3b82f6]" : ""}
                  `}
                  onClick={() => handleDayClick(day)}
                >
                  <span
                    className={`text-sm
                    ${start || end ? "text-white" : ""}
                    ${!current && !start && !end ? "text-gray-300" : ""}
                    ${current && !start && !end ? "text-gray-700" : ""}
                  `}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
