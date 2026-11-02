import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound } from "lucide-react";
import { authApi, getErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/feedback";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm the new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const { user, setUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword);
      if (user) setUser({ ...user, mustChangePassword: false });
      navigate("/", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{t("Change password")}</h1>
            <p className="text-sm text-zinc-500">
              {user?.mustChangePassword
                ? t("The default password must be changed before continuing.")
                : t("Update your account password.")}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Label htmlFor="currentPassword">{t("Current password")}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              className="mt-1.5"
              {...register("currentPassword")}
            />
            <FieldError message={errors.currentPassword?.message} />
          </div>
          <div>
            <Label htmlFor="newPassword">{t("New password")}</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className="mt-1.5"
              {...register("newPassword")}
            />
            <FieldError message={errors.newPassword?.message} />
          </div>
          <div>
            <Label htmlFor="confirmPassword">{t("Confirm new password")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="mt-1.5"
              {...register("confirmPassword")}
            />
            <FieldError message={errors.confirmPassword?.message} />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("Updating…") : t("Update password")}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-4 w-full text-center text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
        >
          {t("Sign out instead")}
        </button>
      </div>
    </div>
  );
}
