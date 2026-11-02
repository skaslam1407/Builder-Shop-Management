import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Category, Item, ItemInput, Unit } from "@/lib/types";
import { getErrorMessage } from "@/lib/api";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

const optionalText = z.string().optional();

const schema = z.object({
  itemCode: z.string().trim().min(1, "Item code is required").max(50),
  name: z.string().trim().min(1, "Item name is required").max(150),
  categoryId: optionalText,
  defaultUnitId: optionalText,
  purchaseRate: z.number().min(0, "Purchase rate cannot be negative"),
  sellingRate: z.number().min(0, "Selling rate cannot be negative"),
  hsnCode: optionalText.refine(
    (value) => !value || /^\d{2,8}$/.test(value.trim()),
    "HSN must be 2 to 8 digits",
  ),
  taxRate: z.number().min(0).max(100, "Tax rate cannot exceed 100%"),
  reorderLevel: z.number().min(0, "Reorder level cannot be negative"),
  description: optionalText,
});

type FormValues = z.infer<typeof schema>;

interface ItemFormProps {
  item?: Item | null;
  categories: Category[];
  units: Unit[];
  onSubmit: (input: ItemInput) => Promise<void>;
  onCancel: () => void;
}

const blank: FormValues = {
  itemCode: "",
  name: "",
  categoryId: "",
  defaultUnitId: "",
  purchaseRate: 0,
  sellingRate: 0,
  hsnCode: "",
  taxRate: 0,
  reorderLevel: 0,
  description: "",
};

export function ItemForm({ item, categories, units, onSubmit, onCancel }: ItemFormProps) {
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
    if (item) {
      reset({
        itemCode: item.itemCode,
        name: item.name,
        categoryId: item.categoryId ? String(item.categoryId) : "",
        defaultUnitId: item.defaultUnitId ? String(item.defaultUnitId) : "",
        purchaseRate: paiseToRupees(item.purchaseRateMinor),
        sellingRate: paiseToRupees(item.sellingRateMinor),
        hsnCode: item.hsnCode ?? "",
        taxRate: item.defaultTaxRateBps / 100,
        reorderLevel: item.reorderLevelMilli / 1000,
        description: item.description ?? "",
      });
    } else {
      reset(blank);
    }
  }, [item, reset]);

  const submit = async (values: FormValues) => {
    setError(null);
    try {
      await onSubmit({
        itemCode: values.itemCode.trim(),
        name: values.name.trim(),
        categoryId: values.categoryId ? Number(values.categoryId) : undefined,
        defaultUnitId: values.defaultUnitId ? Number(values.defaultUnitId) : undefined,
        description: values.description?.trim() || undefined,
        purchaseRateMinor: rupeesToPaise(values.purchaseRate),
        sellingRateMinor: rupeesToPaise(values.sellingRate),
        hsnCode: values.hsnCode?.trim() || undefined,
        defaultTaxRateBps: Math.round(values.taxRate * 100),
        reorderLevelMilli: Math.round(values.reorderLevel * 1000),
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
          <Label htmlFor="itemCode">
            Item code <span className="text-red-500">*</span>
          </Label>
          <Input id="itemCode" className="mt-1.5" {...register("itemCode")} />
          <FieldError message={errors.itemCode?.message} />
        </div>
        <div>
          <Label htmlFor="name">
            Item name <span className="text-red-500">*</span>
          </Label>
          <Input id="name" className="mt-1.5" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="categoryId">{t("Category")}</Label>
          <Select id="categoryId" className="mt-1.5" {...register("categoryId")}>
            <option value="">{t("Uncategorized")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="defaultUnitId">{t("Default unit")}</Label>
          <Select id="defaultUnitId" className="mt-1.5" {...register("defaultUnitId")}>
            <option value="">{t("No unit")}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.abbreviation})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="purchaseRate">{t("Purchase rate (₹)")}</Label>
          <Input
            id="purchaseRate"
            type="number"
            step="0.01"
            min="0"
            className="mt-1.5"
            {...register("purchaseRate", numberValue)}
          />
          <FieldError message={errors.purchaseRate?.message} />
        </div>
        <div>
          <Label htmlFor="sellingRate">{t("Selling rate (₹)")}</Label>
          <Input
            id="sellingRate"
            type="number"
            step="0.01"
            min="0"
            className="mt-1.5"
            {...register("sellingRate", numberValue)}
          />
          <FieldError message={errors.sellingRate?.message} />
        </div>
        <div>
          <Label htmlFor="hsnCode">{t("HSN / SAC")}</Label>
          <Input id="hsnCode" className="mt-1.5" maxLength={8} {...register("hsnCode")} />
          <FieldError message={errors.hsnCode?.message} />
        </div>
        <div>
          <Label htmlFor="taxRate">{t("Default GST rate (%)")}</Label>
          <Input
            id="taxRate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="mt-1.5"
            {...register("taxRate", numberValue)}
          />
          <FieldError message={errors.taxRate?.message} />
        </div>
        <div>
          <Label htmlFor="reorderLevel">{t("Reorder level")}</Label>
          <Input
            id="reorderLevel"
            type="number"
            step="0.001"
            min="0"
            className="mt-1.5"
            {...register("reorderLevel", numberValue)}
          />
          <FieldError message={errors.reorderLevel?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="description">{t("Description")}</Label>
        <Textarea id="description" className="mt-1.5" rows={2} {...register("description")} />
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("Saving…") : item ? t("Save changes") : t("Create item")}
        </Button>
      </div>
    </form>
  );
}
