import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Cog, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

type Role = "operator" | "reviewer" | "viewer";

interface VariableItem {
  key: string;
  value: string;
  description: string;
}

const ROLE_MATRIX: Array<{ name: string; permissions: string; members: number; tier: string }> = [
  { name: "Operations", permissions: "Launch / Pause / Retry", members: 6, tier: "Full access" },
  { name: "Compliance", permissions: "Review drafts / Approve scripts", members: 4, tier: "Rigorous" },
  { name: "Stakeholder", permissions: "View dashboards / Annotate", members: 12, tier: "Read only" },
];

export function AdminPage() {
  const { toast } = useToast();
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const metrics = useAppStore((state) => state.metrics);

  const [role, setRole] = useState<Role>("operator");
  const [email, setEmail] = useState("");

  const variables: VariableItem[] = useMemo(
    () => [
      {
        key: "API_BASE_URL",
        value: import.meta.env.VITE_API_BASE ?? "http://localhost:4000/api",
        description: "Origin for workflow orchestration requests.",
      },
      {
        key: "DEFAULT_REGION",
        value: "global",
        description: "Primary workspace context applied to new members.",
      },
      {
        key: "FFMPEG_BINARY",
        value: "ffmpeg",
        description: "Binary alias used for local render validation.",
      },
    ],
    [],
  );

  const handleInvite = () => {
    if (!email.trim()) {
      toast({ title: "Missing email", description: "Provide a corporate email before inviting.", variant: "destructive" });
      return;
    }
    toast({
      title: "Invitation sent",
      description: `${email} will receive the ${role} role onboarding kit.`,
    });
    setEmail("");
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Console"
        description="Manage roles, review platform variables, and simulate security policies."
        actions={
          <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-wide text-cyan-200">
            Theme: {theme}
          </Badge>
        }
      />

      <Card className="bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cog className="h-4 w-4 text-cyan-300" />
            Access tiers
          </CardTitle>
          <CardDescription>Assign the right surface area to each function. Changes sync instantly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ROLE_MATRIX.map((item) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-slate-300">{item.permissions}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Badge variant="outline" className="border-cyan-400/40 text-cyan-200">
                    {item.tier}
                  </Badge>
                  <span>{item.members} members</span>
                </div>
              </div>
            </motion.div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Environment variables</CardTitle>
            <CardDescription>Read-only snapshot used by the front end mock environment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-200">
            {variables.map((variable) => (
              <div
                key={variable.key}
                className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{variable.key}</p>
                    <p className="text-xs text-slate-400">{variable.description}</p>
                  </div>
                  <Badge variant="secondary">{variable.value}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Security posture</CardTitle>
            <CardDescription>Toggle policies to simulate different workspace guard rails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                variant={theme === "dark" ? "default" : "secondary"}
                size="sm"
                onClick={() => setTheme("dark")}
              >
                <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                Dark mode
              </Button>
              <Button
                variant={theme === "light" ? "default" : "secondary"}
                size="sm"
                onClick={() => setTheme("light")}
              >
                <ShieldOff className="mr-2 h-3.5 w-3.5" />
                Light mode
              </Button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
              <p>SSO enforced, session lifetime 12 hours, audit trail retention 90 days.</p>
              <p className="mt-2 text-xs text-slate-400">
                These values are simulated. Update the real config from the platform admin service.
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="w-full rounded-2xl">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Review policy
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Security policy summary</DialogTitle>
                  <DialogDescription>Export a PDF summary or share the compliance view.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm text-slate-300">
                  <p>MFA required for all operators and reviewers.</p>
                  <p>Secrets are scoped by workspace; rotation reminders fire every 30 days.</p>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>Add a team member</CardTitle>
          <CardDescription>Invites expire in 48 hours. Roles can be adjusted after onboarding.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              placeholder="name@enterprise.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger id="invite-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operator">Operations</SelectItem>
                <SelectItem value="reviewer">Compliance</SelectItem>
                <SelectItem value="viewer">Stakeholder</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full rounded-2xl" onClick={handleInvite}>
              <UserPlus className="mr-2 h-4 w-4" />
              Send invite
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminPage;
