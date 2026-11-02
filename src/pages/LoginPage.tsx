import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { HardHat, LockKeyhole } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getErrorMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/feedback";

const schema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { user, login } = useAuthStore();
  const navigate = useNavigate();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) {
    return <Navigate to={user.mustChangePassword ? "/change-password" : "/"} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const loggedIn = await login(values.username, values.password);
      navigate(loggedIn.mustChangePassword ? "/change-password" : "/", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="grid h-full lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-zinc-950 p-12 text-zinc-300 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-zinc-950">
            <HardHat className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-white">{t("Builder Shop")}</p>
            <p className="text-xs text-zinc-500">{t("Management & Billing")}</p>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Run the shop counter without an internet connection.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Customers, materials, GST invoices, payments, stock, and reports stay on this
            computer in a single protected local database.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-zinc-400">
            <li>GST and non-GST billing</li>
            <li>Integer-paise financial calculations</li>
            <li>Audited, reversible financial records</li>
            <li>Backups stored outside the application install</li>
          </ul>
        </div>
        <p className="text-xs text-zinc-600">{t("Version 0.1.0 · Offline-first desktop")}</p>
      </div>

      <div className="flex items-center justify-center bg-zinc-50 p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-zinc-950">
                <HardHat className="h-5 w-5" />
              </div>
              <p className="text-lg font-semibold">{t("Builder Shop")}</p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">{t("Sign in")}</h2>
                <p className="text-sm text-zinc-500">{t("Use your shop application account.")}</p>
              </div>
            </div>

            {error ? (
              <div className="mb-4">
                <ErrorBanner message={error} />
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <Label htmlFor="username">{t("Username")}</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  className="mt-1.5"
                  {...register("username")}
                />
                <FieldError message={errors.username?.message} />
              </div>
              <div>
                <Label htmlFor="password">{t("Password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="mt-1.5"
                  {...register("password")}
                />
                <FieldError message={errors.password?.message} />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("Signing in…") : t("Sign in")}
              </Button>
            </form>

            <div className="mt-6 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-900">
              <p className="font-medium">{t("First run")}</p>
              <p className="mt-1">
                Sign in with <span className="font-mono">admin</span> /{" "}
                <span className="font-mono">admin123</span> and change the password immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
