"use client";

import { useEffect, useState, FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useCompanyPortal } from "@/lib/companyContext";
import { collectUkTeam, CollectUkTeamMember, CollectUkCompanyRoleName, FulfilmentApiError } from "@/lib/api";

const ROLE_OPTIONS = [
  { value: "COMPANY_ADMIN", label: "Admin" },
  { value: "DISPATCHER", label: "Dispatcher" },
];
const roleLabel = (r: string) => (r === "COMPANY_ADMIN" ? "Admin" : "Dispatcher");

export default function CompanyTeamPage() {
  const { company, isAdmin } = useCompanyPortal();
  const { toast } = useToast();

  // Non-admins can't fetch the team, so they never enter a loading state.
  const [loading, setLoading] = useState(isAdmin);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<CollectUkTeamMember[]>([]);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string | undefined>("DISPATCHER");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setMembers(await collectUkTeam.list(company.id));
      } catch (err) {
        setError(err instanceof FulfilmentApiError ? err.message : "Could not load your team right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id, isAdmin]);

  if (!isAdmin) {
    return <Alert tone="info">Only company admins can manage the team. Ask an admin to add or change members.</Alert>;
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !role) return;
    setAdding(true);
    setAddError(null);
    try {
      const member = await collectUkTeam.add(company.id, { email: email.trim(), role: role as CollectUkCompanyRoleName });
      setMembers(prev => [...prev, member]);
      setEmail("");
      toast({ title: "Team member added", tone: "success" });
    } catch (err) {
      if (err instanceof FulfilmentApiError && err.code === "NO_ACCOUNT") {
        setAddError("No Vamba account with that email yet — ask them to sign up first, then add them.");
      } else if (err instanceof FulfilmentApiError && err.code === "ALREADY_MEMBER") {
        setAddError("They're already on your team.");
      } else if (err instanceof FulfilmentApiError && err.code === "ROLE_CONFLICT") {
        setAddError("That account is a driver, so it can't join a company team.");
      } else {
        setAddError(err instanceof FulfilmentApiError ? err.message : "Could not add that person.");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRole = async (member: CollectUkTeamMember, next: string) => {
    if (next === member.role) return;
    try {
      const updated = await collectUkTeam.changeRole(company.id, member.roleId, next as CollectUkCompanyRoleName);
      setMembers(prev => prev.map(m => (m.roleId === member.roleId ? { ...m, role: updated.role } : m)));
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not change role", tone: "error" });
    }
  };

  const handleRemove = async (member: CollectUkTeamMember) => {
    if (!window.confirm(`Remove ${member.email ?? "this member"} from the team?`)) return;
    try {
      await collectUkTeam.remove(company.id, member.roleId);
      setMembers(prev => prev.filter(m => m.roleId !== member.roleId));
    } catch (err) {
      toast({ title: err instanceof FulfilmentApiError ? err.message : "Could not remove member", tone: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-base font-semibold text-text">Add a team member</h2>
        <p className="mt-1 text-sm text-muted">
          They need a Vamba account first (sign up at the login page). Add them by email and pick their role.
        </p>
        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Email" required>
              {p => <Input {...p} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@email.com" />}
            </Field>
            <Field label="Role">
              {p => <Select {...p} value={role} onValueChange={setRole} options={ROLE_OPTIONS} />}
            </Field>
          </div>
          {addError && <Alert tone="error">{addError}</Alert>}
          <Button type="submit" size="md" loading={adding} disabled={!email.trim()}>
            Add member
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted">
          <strong>Admin</strong> — full access, including team and settings. <strong>Dispatcher</strong> — day-to-day ops
          (bookings, receiving, manifests, quotes, payments), but not team or company settings.
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-text">Team</h2>
        {loading && (
          <div className="mt-3 flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!loading && error && <Alert tone="error">{error}</Alert>}
        {!loading && !error && members.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {members.map(m => (
              <li key={m.roleId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text">
                    {m.email ?? "(unknown email)"}
                    {m.isYou && <span className="ml-2 align-middle"><StatusBadge label="You" tone="info" /></span>}
                  </div>
                  <div className="text-xs text-muted">{roleLabel(m.role)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-36">
                    <Select value={m.role} onValueChange={next => handleRole(m, next)} options={ROLE_OPTIONS} />
                  </div>
                  {!m.isYou && (
                    <button type="button" onClick={() => handleRemove(m)} className="text-sm font-medium text-red hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
