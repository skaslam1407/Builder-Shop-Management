import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Supplier, SupplierInput } from "@/lib/types";
import { getErrorMessage } from "@/lib/api";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

const optionalText = z.string().optional();

const schema = z.object({
  supplierCode: optionalText,
  name: z.string().trim().min(1, "Supplier name is required").max(150),
  phone: optionalText,
  email: optionalText.refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email address",
  ),
  gstin: optionalText.refine(
    (value) => !value || value.trim().length === 15,
    "GSTIN must be exactly 15 characters",
  ),
  address: optionalText,
  openingBalance: z.number().min(0, "Opening balance cannot be negative"),
  notes: optionalText,
});

type FormValues = z.infer<typeof schema>;

interface SupplierFormProps {
  supplier?: Supplier | null;
  onSubmit: (input: SupplierInput) => Promise<void>;
  onCancel: () => void;
}

const blank: FormValues = {
  supplierCode: "",
  name: "",
  phone: "",
  email: "",
  gstin: "",
  address: "",
  openingBalance: 0,
  notes: "",
};

export function SupplierForm({ supplier, onSubmit, onCancel }: SupplierFormProps) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: blank,
  });

  useEffect(() => {
    if (supplier) {
      reset({
        supplierCode: supplier.supplierCode ?? "",
        name: supplier.name,
        phone: supplier.phone ?? "",
        email: supplier.email ?? "",
        gstin: supplier.gstin ?? "",
        address: supplier.address ?? "",
        openingBalance: paiseToRupees(supplier.openingBalanceMinor),
        notes: supplier.notes ?? "",
      });
    } else {
      reset(blank);
    }
  }, [supplier, reset]);

  const submit = async (values: FormValues) => {
    setError(null);
    try {
      await onSubmit({
        supplierCode: values.supplierCode?.trim() || undefined,
        name: values.name.trim(),
        phone: values.phone?.trim() || undefined,
        email: values.email?.trim() || undefined,
        gstin: values.gstin?.trim().toUpperCase() || undefined,
        address: values.address?.trim() || undefined,
        openingBalanceMinor: rupeesToPaise(values.openingBalance),
        notes: values.notes?.trim() || undefined,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const numberValue = {
    setValueAs: (value: unknown) =>
      value === "" || value === null || value === undefined ? 0 : Number(value),
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="supplierCode">{t("Supplier code")}</Label>
          <Input
            id="supplierCode"
            className="mt-1.5"
            placeholder={t("Auto-generated if blank")}
            {...register("supplierCode")}
          />
        </div>
        <div>
          <Label htmlFor="name">
            {t("Name")} <span className="text-red-500">*</span>
          </Label>
          <Input id="name" className="mt-1.5" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="phone">{t("Phone")}</Label>
          <Input id="phone" className="mt-1.5" {...register("phone")} />
        </div>
        <div>
          <Label htmlFor="email">{t("Email")}</Label>
          <Input id="email" type="email" className="mt-1.5" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="gstin">{t("GSTIN")}</Label>
          <Input id="gstin" className="mt-1.5 uppercase" maxLength={15} {...register("gstin")} />
          <FieldError message={errors.gstin?.message} />
        </div>
        <div>
          <Label htmlFor="openingBalance">{t("Opening balance (₹)")}</Label>
          <Input
            id="openingBalance"
            type="number"
            step="0.01"
            min="0"
            className="mt-1.5"
            {...register("openingBalance", numberValue)}
          />
          <FieldError message={errors.openingBalance?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="address">{t("Address")}</Label>
        <Textarea id="address" className="mt-1.5" rows={3} {...register("address")} />
      </div>

      <div>
        <Label htmlFor="notes">{t("Notes")}</Label>
        <Textarea id="notes" className="mt-1.5" rows={2} {...register("notes")} />
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : supplier ? t("Save changes") : t("Create supplier")}
        </Button>
      </div>
    </form>
  );
}
