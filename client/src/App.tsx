import { useEffect, useRef, useState } from "react";
import { Route, Switch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import { CalculatorDialog } from "@/components/calculator-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PermissionsProvider, usePermissions } from "@/lib/permissions";
import { SettingsProvider } from "@/lib/settings";
import { notifySessionExpired, resetSessionExpiredNotification, subscribeSessionExpired } from "@/lib/session-timeout";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldX } from "lucide-react";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import CustomersPage from "@/pages/customers";
import DealsPage from "@/pages/deals";
import RegionalCustomerListPage from "@/pages/regional-customer-list";
import RegionalUnpaidsPage from "@/pages/regional-unpaids";
import RegionalUnpaidDbPage from "@/pages/regional-unpaid-db";
import RegionalManagementFeesPage from "@/pages/regional-management-fees";
import ActivitiesPage from "@/pages/activities";
import OrgChart from "@/pages/org-chart";
import UsersPage from "@/pages/users";
import TimelinePage from "@/pages/timeline";
import SalesAnalyticsPage from "@/pages/sales-analytics";
import PaymentsPage from "@/pages/payments";
import RefundsPage from "@/pages/refunds";
import SystemLogsPage from "@/pages/system-logs";
import ProductsPage from "@/pages/products";
import ContractsPage from "@/pages/contracts";
import PermissionsPage from "@/pages/permissions";
import SystemSettingsPage from "@/pages/system-settings";
import ReceivablesPage from "@/pages/receivables";
import DepositConfirmationsPage from "@/pages/deposit-confirmations";
import NoticesPage from "@/pages/notices";
import BackupPage from "@/pages/backup";
import AdminPage from "@/pages/admin";
import QuotationsPage from "@/pages/quotations";

function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-4">
        <ShieldX className="w-16 h-16 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-bold">접근 권한이 없습니다</h2>
        <p className="text-sm text-muted-foreground">
          이 페이지에 접근할 권한이 없습니다.
          <br />
          관리자에게 문의해주세요.
        </p>
      </div>
    </div>
  );
}

function ProtectedRoute({ path, component: Component }: { path: string; component: React.ComponentType }) {
  const { hasPathAccess } = usePermissions();
  if (!hasPathAccess(path)) {
    return <AccessDenied />;
  }
  return <Component />;
}

function DeveloperRoute({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  if (user?.role !== "개발자") {
    return <AccessDenied />;
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <ProtectedRoute path="/analytics/sales" component={SalesAnalyticsPage} />}</Route>
      <Route path="/customers">{() => <ProtectedRoute path="/customers" component={CustomersPage} />}</Route>
      <Route path="/deals">{() => <ProtectedRoute path="/deals" component={DealsPage} />}</Route>
      <Route path="/regional-customer-list">{() => <ProtectedRoute path="/regional-customer-list" component={RegionalCustomerListPage} />}</Route>
      <Route path="/regional-unpaids">{() => <ProtectedRoute path="/regional-unpaids" component={RegionalUnpaidsPage} />}</Route>
      <Route path="/regional-unpaid-db">{() => <ProtectedRoute path="/regional-unpaid-db" component={RegionalUnpaidDbPage} />}</Route>
      <Route path="/regional-management-fees">{() => <ProtectedRoute path="/regional-management-fees" component={RegionalManagementFeesPage} />}</Route>
      <Route path="/activities">{() => <ProtectedRoute path="/activities" component={ActivitiesPage} />}</Route>
      <Route path="/timeline">{() => <ProtectedRoute path="/timeline" component={TimelinePage} />}</Route>
      <Route path="/analytics/sales">{() => <ProtectedRoute path="/analytics/sales" component={SalesAnalyticsPage} />}</Route>
      <Route path="/payments">{() => <ProtectedRoute path="/payments" component={PaymentsPage} />}</Route>
      <Route path="/refunds">{() => <ProtectedRoute path="/refunds" component={RefundsPage} />}</Route>
      <Route path="/settings/org">{() => <ProtectedRoute path="/settings/org" component={OrgChart} />}</Route>
      <Route path="/settings/users">{() => <ProtectedRoute path="/settings/users" component={UsersPage} />}</Route>
      <Route path="/settings/logs">{() => <ProtectedRoute path="/settings/logs" component={SystemLogsPage} />}</Route>
      <Route path="/settings/permissions">{() => <ProtectedRoute path="/settings/permissions" component={PermissionsPage} />}</Route>
      <Route path="/settings/system">{() => <ProtectedRoute path="/settings/system" component={SystemSettingsPage} />}</Route>
      <Route path="/products">{() => <ProtectedRoute path="/products" component={ProductsPage} />}</Route>
      <Route path="/quotations">{() => <ProtectedRoute path="/quotations" component={QuotationsPage} />}</Route>
      <Route path="/contracts">{() => <ProtectedRoute path="/contracts" component={ContractsPage} />}</Route>
      <Route path="/receivables">{() => <ProtectedRoute path="/receivables" component={ReceivablesPage} />}</Route>
      <Route path="/deposit-confirmations">{() => <ProtectedRoute path="/deposit-confirmations" component={DepositConfirmationsPage} />}</Route>
      <Route path="/notice">{() => <ProtectedRoute path="/notice" component={NoticesPage} />}</Route>
      <Route path="/settings/backup">{() => <DeveloperRoute component={BackupPage} />}</Route>
      <Route path="/settings/admin">{() => <DeveloperRoute component={AdminPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);
  const hadAuthenticatedUser = useRef(false);

  useEffect(() => {
    return subscribeSessionExpired(() => {
      setSessionExpiredOpen(true);
    });
  }, []);

  useEffect(() => {
    if (hadAuthenticatedUser.current && !user) {
      notifySessionExpired();
    }
    hadAuthenticatedUser.current = Boolean(user);
  }, [user]);

  const handleSessionExpiredConfirm = () => {
    resetSessionExpiredNotification();
    setSessionExpiredOpen(false);
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "/api/auth/me" });
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full rounded-none" />
          <Skeleton className="h-4 w-3/4 rounded-none" />
          <Skeleton className="h-4 w-1/2 rounded-none" />
        </div>
      </div>
    );
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <>
      {user ? (
        <PermissionsProvider>
          <SettingsProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 overflow-hidden">
                  <header className="flex items-center justify-between gap-2 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    <div className="flex items-center gap-2">
                      <ThemeToggle />
                      <CalculatorDialog />
                      <UserProfileMenu />
                    </div>
                  </header>
                  <main className="flex-1 overflow-auto">
                    <Router />
                  </main>
                </div>
              </div>
            </SidebarProvider>
          </SettingsProvider>
        </PermissionsProvider>
      ) : (
        <LoginPage />
      )}
      <AlertDialog open={sessionExpiredOpen}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle>세션이 만료되었습니다</AlertDialogTitle>
            <AlertDialogDescription>
              로그인 유지 시간이 지나서 세션이 종료되었습니다. 확인을 누르면 로그인 화면으로 이동합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="rounded-none"
              onClick={handleSessionExpiredConfirm}
              data-testid="button-session-timeout-confirm"
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
