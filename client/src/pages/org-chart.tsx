import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Megaphone, MapPin, Crown, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

interface TeamConfig {
  id: string;
  name: string;
  departments: string[];
  icon: React.ElementType;
  clickable: boolean;
}

const teamConfigs: TeamConfig[] = [
  { id: "management", name: "경영지원팀", departments: ["경영지원팀", "경영지원실", "경영지원실팀"], icon: Building2, clickable: false },
  { id: "marketing", name: "마케팅팀", departments: ["마케팅팀"], icon: Megaphone, clickable: false },
  { id: "regional", name: "타지역팀", departments: ["타지역팀"], icon: MapPin, clickable: false },
];

const executiveConfig = [
  { id: "ceo", title: "CEO", role: "대표이사", position: "대표이사", icon: Crown },
  { id: "hq", title: "HQ", role: "총괄이사", position: "총괄이사", icon: Briefcase },
];

function TeamCard({ config, members, onMemberClick }: { config: TeamConfig; members: User[]; onMemberClick: (member: User) => void }) {
  const Icon = config.icon;

  return (
    <Card className="bg-card border-border overflow-hidden rounded-none" data-testid={`team-${config.id}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="font-bold text-primary">{config.name}</h3>
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="p-4 space-y-3">
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">구성원 없음</p>
        ) : (
          members.map((member) => (
            (() => {
              const roleLabel = (member.role || "").trim();
              const shouldShowRole = roleLabel !== "" && !["A", "B"].includes(roleLabel);

              return (
            <div
              key={member.id}
              className={`flex items-center justify-between p-3 bg-muted/20 border border-border transition-colors ${
                config.clickable ? "cursor-pointer hover:bg-muted/40" : ""
              }`}
              onClick={() => config.clickable && onMemberClick(member)}
              data-testid={`member-${member.id}`}
            >
              <div className="min-w-0">
                <div>
                  <p className="text-sm font-semibold">{member.name}</p>
                  {shouldShowRole ? <p className="text-xs text-muted-foreground">{roleLabel}</p> : null}
                </div>
              </div>
              <Badge
                variant={member.isActive ? "default" : "secondary"}
                className={`text-xs rounded-none ${member.isActive ? "bg-primary" : ""}`}
              >
                {member.isActive ? "활성" : "비활성"}
              </Badge>
            </div>
              );
            })()
          ))
        )}
      </div>
    </Card>
  );
}

export default function OrgChart() {
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const executives = executiveConfig.map((config) => {
    const user = users.find((u) => u.role === config.role || u.name === config.position);
    return {
      ...config,
      name: user?.name || config.position,
    };
  });

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-org-title">
          주식회사 어스루프 조직도
        </h1>
        <p className="text-muted-foreground text-sm">
          EARTHLOOP Corporation Organization & Talent Management
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 mb-12">
        {executives.map((exec) => {
          const Icon = exec.icon;
          return (
            <Card
              key={exec.id}
              className="bg-card border-border overflow-hidden rounded-none w-64"
              data-testid={`executive-${exec.id}`}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-bold text-primary">{exec.title}</h3>
                <Icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="p-5 text-center">
                <p className="text-lg font-semibold mb-1">{exec.name}</p>
                <p className="text-sm text-muted-foreground">{exec.position}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {teamConfigs.map((config) => {
          const departmentSet = new Set(config.departments.map((department) => department.trim()));
          const members = users.filter(
            (u) =>
              departmentSet.has((u.department || "").trim()) &&
              u.role !== "대표이사" &&
              u.role !== "총괄이사" &&
              u.role !== "개발자"
          );
          return <TeamCard key={config.id} config={config} members={members} onMemberClick={() => {}} />;
        })}
      </div>
    </div>
  );
}
