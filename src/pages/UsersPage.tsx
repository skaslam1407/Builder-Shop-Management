import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { getErrorMessage, userApi } from "@/lib/api";
import type { Paged, RoleSummary, UserAccount, UserCreateInput } from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingBlock, SuccessBanner } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

const emptyPage: Paged<UserAccount> = { items: [], total: 0, page: 1, pageSize: 25 };

interface FormState {
  username: string;
  displayName: string;
  password: string;
  roleIds: number[];
  isActive: boolean;
  mustChangePassword: boolean;
}

const blankForm: FormState = {
  username: "",
  displayName: "",
  password: "",
  roleIds: [],
  isActive: true,
  mustChangePassword: true,
};

export function UsersPage() {
  const currentUser = useAuthStore((state) => state.user);
  const [data, setData] = useState<Paged<UserAccount>>(emptyPage);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [resetUser, setResetUser] = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [users, roleList] = await Promise.all([
        userApi.list({ search: search.trim() || undefined, page: 1, pageSize: 100 }),
        userApi.roles(),
      ]);
      setData(users);
      setRoles(roleList);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...blankForm,
      roleIds: roles.find((role) => role.name === "Viewer")?.id
        ? [roles.find((role) => role.name === "Viewer")!.id]
        : [],
    });
    setFormOpen(true);
  };

  const openEdit = (user: UserAccount) => {
    setEditing(user);
    setForm({
      username: user.username,
      displayName: user.displayName,
      password: "",
      roleIds: user.roles.map((role) => role.id),
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    });
    setFormOpen(true);
  };

  const toggleRole = (roleId: number) => {
    setForm((current) => ({
      ...current,
      roleIds: current.roleIds.includes(roleId)
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId],
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      if (editing) {
        await userApi.update(editing.id, {
          displayName: form.displayName,
          roleIds: form.roleIds,
          isActive: form.isActive,
          mustChangePassword: form.mustChangePassword,
        });
        setSaved(t("User updated."));
      } else {
        const input: UserCreateInput = {
          username: form.username,
          displayName: form.displayName,
          password: form.password,
          roleIds: form.roleIds,
          mustChangePassword: form.mustChangePassword,
        };
        await userApi.create(input);
        setSaved(t("User created."));
      }
      setFormOpen(false);
      setEditing(null);
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: UserAccount) => {
    if (!window.confirm(`${user.isActive ? "Deactivate" : "Activate"} ${user.username}?`)) return;
    setError(null);
    try {
      await userApi.setActive(user.id, !user.isActive);
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const submitReset = async () => {
    if (!resetUser) return;
    setSaving(true);
    setError(null);
    try {
      await userApi.resetPassword(resetUser.id, newPassword);
      setResetUser(null);
      setNewPassword("");
      setSaved(t("Temporary password set. The user must change it at next sign-in."));
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">{t("Users & Roles")}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t("Create accounts, assign roles, and protect the last administrator.")}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> {t("Add user")}
        </Button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          className="pl-9"
          placeholder={t("Search username or display name")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {saved ? <SuccessBanner message={saved} /> : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <LoadingBlock label={t("Loading users…")} />
        ) : data.items.length === 0 ? (
          <EmptyState title={t("No users found")} description={t("Add a user to get started.")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("User")}</TableHead>
                <TableHead>{t("Roles")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Last login")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="font-medium text-zinc-900">{user.displayName}</p>
                    <p className="font-mono text-xs text-zinc-500">@{user.username}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role.id} variant="outline">
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={user.isActive ? "success" : "muted"}>
                        {user.isActive ? t("Active") : t("Inactive")}
                      </Badge>
                      {user.mustChangePassword ? (
                        <Badge variant="outline">{t("Password change due")}</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                        <Pencil className="h-3.5 w-3.5" /> {t("Edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setResetUser(user);
                          setNewPassword("");
                        }}
                      >
                        <KeyRound className="h-3.5 w-3.5" /> {t("Reset password")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void toggleActive(user)}
                        disabled={user.id === currentUser?.id}
                      >
                        {user.isActive ? (
                          <>
                            <UserX className="h-3.5 w-3.5" /> {t("Deactivate")}
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3.5 w-3.5" /> {t("Activate")}
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? t("Edit user") : t("Add user")}
        description={t("Roles determine backend-enforced permissions.")}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="userName">{t("Username")}</Label>
            <Input
              id="userName"
              className="mt-1.5"
              value={form.username}
              disabled={Boolean(editing)}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="displayName">{t("Display name")}</Label>
            <Input
              id="displayName"
              className="mt-1.5"
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            />
          </div>
          {!editing ? (
            <div>
              <Label htmlFor="password">{t("Temporary password")}</Label>
              <Input
                id="password"
                type="password"
                className="mt-1.5"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </div>
          ) : null}
          <div>
            <Label>{t("Roles")}</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-start gap-2 rounded-md border border-zinc-200 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-brand-600"
                    checked={form.roleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                  />
                  <span>
                    <span className="block font-medium text-zinc-900">{role.name}</span>
                    <span className="text-xs text-zinc-500">{role.description ?? ""}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-zinc-600">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
                checked={form.isActive}
                disabled={editing?.id === currentUser?.id}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              {t("Active account")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
                checked={form.mustChangePassword}
                onChange={(event) =>
                  setForm({ ...form, mustChangePassword: event.target.checked })
                }
              />
              {t("Require password change")}
            </label>
          </div>
          <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              <ShieldCheck className="h-4 w-4" />
              {saving ? t("Saving…") : editing ? t("Save changes") : t("Create user")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        title={t("Reset password")}
        description={resetUser ? `@${resetUser.username}` : undefined}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="resetPassword">{t("New temporary password")}</Label>
            <Input
              id="resetPassword"
              type="password"
              className="mt-1.5"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setResetUser(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void submitReset()} disabled={saving}>
              {saving ? t("Saving…") : t("Reset password")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
