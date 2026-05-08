import { createContext, useContext, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

interface SystemSettings {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_ceo: string;
  company_business_number: string;
  system_language: string;
  system_timezone: string;
  system_date_format: string;
  session_timeout: string;
  notification_email: string;
  notification_system: string;
  data_backup_cycle: string;
  max_login_attempts: string;
  password_min_length: string;
  [key: string]: string;
}

const defaultSettings: SystemSettings = {
  company_name: "어스루프",
  company_address: "",
  company_phone: "",
  company_email: "",
  company_ceo: "",
  company_business_number: "",
  system_language: "ko",
  system_timezone: "Asia/Seoul",
  system_date_format: "yyyy-MM-dd",
  session_timeout: "30",
  notification_email: "on",
  notification_system: "on",
  data_backup_cycle: "daily",
  max_login_attempts: "5",
  password_min_length: "8",
};

interface SettingsContextType {
  settings: SystemSettings;
  formatDate: (date: Date | string | null | undefined) => string;
  formatDateTime: (date: Date | string | null | undefined) => string;
  formatTime: (date: Date | string | null | undefined) => string;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  formatDate: () => "",
  formatDateTime: () => "",
  formatTime: () => "",
});

function applyDateFormat(date: Date, format: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year")?.value || "";
  const m = parts.find(p => p.type === "month")?.value || "";
  const d = parts.find(p => p.type === "day")?.value || "";

  switch (format) {
    case "yyyy-MM-dd": return `${y}-${m}-${d}`;
    case "dd/MM/yyyy": return `${d}/${m}/${y}`;
    case "MM/dd/yyyy": return `${m}/${d}/${y}`;
    case "yyyy.MM.dd": return `${y}.${m}.${d}`;
    default: return `${y}-${m}-${d}`;
  }
}

function applyDateTimeFormat(date: Date, format: string, timezone: string): string {
  const dateStr = applyDateFormat(date, format, timezone);
  const timeStr = new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${dateStr} ${timeStr}`;
}

function applyTimeFormat(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery<SystemSettings>({
    queryKey: ["/api/system-settings"],
    staleTime: 60000,
  });

  const settings = { ...defaultSettings, ...data };

  const formatDate = useCallback((date: Date | string | null | undefined): string => {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "-";
    return applyDateFormat(d, settings.system_date_format, settings.system_timezone);
  }, [settings.system_date_format, settings.system_timezone]);

  const formatDateTime = useCallback((date: Date | string | null | undefined): string => {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "-";
    return applyDateTimeFormat(d, settings.system_date_format, settings.system_timezone);
  }, [settings.system_date_format, settings.system_timezone]);

  const formatTime = useCallback((date: Date | string | null | undefined): string => {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "-";
    return applyTimeFormat(d, settings.system_timezone);
  }, [settings.system_timezone]);

  return (
    <SettingsContext.Provider value={{ settings, formatDate, formatDateTime, formatTime }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
