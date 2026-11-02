import { useState, type FormEvent } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { catalogApi, getErrorMessage } from "@/lib/api";
import type { Category, Unit } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/feedback";
import { t } from "@/lib/i18n";

interface CatalogManagerProps {
  categories: Category[];
  units: Unit[];
  onChanged: () => void;
}

interface CategoryDraft {
  id: number | null;
  name: string;
  description: string;
}

interface UnitDraft {
  id: number | null;
  name: string;
  abbreviation: string;
  precision: string;
}

const emptyCategory: CategoryDraft = { id: null, name: "", description: "" };
const emptyUnit: UnitDraft = { id: null, name: "", abbreviation: "", precision: "0" };

export function CatalogManager({ categories, units, onChanged }: CatalogManagerProps) {
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory);
  const [unitDraft, setUnitDraft] = useState<UnitDraft>(emptyUnit);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input = {
        name: categoryDraft.name.trim(),
        description: categoryDraft.description.trim() || undefined,
      };
      if (categoryDraft.id) {
        await catalogApi.updateCategory(categoryDraft.id, input);
      } else {
        await catalogApi.createCategory(input);
      }
      setCategoryDraft(emptyCategory);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveUnit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const input = {
        name: unitDraft.name.trim(),
        abbreviation: unitDraft.abbreviation.trim(),
        precision: Number(unitDraft.precision) || 0,
      };
      if (unitDraft.id) {
        await catalogApi.updateUnit(unitDraft.id, input);
      } else {
        await catalogApi.createUnit(input);
      }
      setUnitDraft(emptyUnit);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleCategory = async (category: Category) => {
    if (
      category.isActive &&
      !window.confirm(`Deactivate category "${category.name}"? Items keep their category link.`)
    ) {
      return;
    }
    try {
      await catalogApi.setCategoryActive(category.id, !category.isActive);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const toggleUnit = async (unit: Unit) => {
    if (
      unit.isActive &&
      !window.confirm(`Deactivate unit "${unit.abbreviation}"? Existing items are not changed.`)
    ) {
      return;
    }
    try {
      await catalogApi.setUnitActive(unit.id, !unit.isActive);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">{t("Categories")}</h3>
            <p className="text-xs text-zinc-500">{t("Group materials for search and reporting.")}</p>
          </div>

          <form onSubmit={saveCategory} className="space-y-2 rounded-lg border border-zinc-200 p-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="categoryName" className="text-xs">
                  {t("Name")}
                </Label>
                <Input
                  id="categoryName"
                  className="mt-1 h-9"
                  value={categoryDraft.name}
                  onChange={(event) =>
                    setCategoryDraft((draft) => ({ ...draft, name: event.target.value }))
                  }
                  placeholder="Cement"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="categoryDescription" className="text-xs">
                  {t("Description")}
                </Label>
                <Input
                  id="categoryDescription"
                  className="mt-1 h-9"
                  value={categoryDraft.description}
                  onChange={(event) =>
                    setCategoryDraft((draft) => ({ ...draft, description: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {categoryDraft.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCategoryDraft(emptyCategory)}
                >
                  <X className="h-3.5 w-3.5" /> {t("Cancel")}
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={busy || !categoryDraft.name.trim()}>
                {categoryDraft.id ? (
                  t("Update category")
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" /> {t("Add category")}
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {categories.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-500">{t("No categories yet.")}</p>
            ) : (
              categories.map((category) => (
                <div key={category.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-800">{category.name}</p>
                    {category.description ? (
                      <p className="truncate text-xs text-zinc-500">{category.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {category.isActive ? (
                      <Badge variant="success">{t("Active")}</Badge>
                    ) : (
                      <Badge variant="muted">{t("Inactive")}</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Edit category")}
                      onClick={() =>
                        setCategoryDraft({
                          id: category.id,
                          name: category.name,
                          description: category.description ?? "",
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void toggleCategory(category)}>
                      {category.isActive ? t("Disable") : t("Enable")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">{t("Units")}</h3>
            <p className="text-xs text-zinc-500">
              Configurable units with a decimal precision (0–6 places).
            </p>
          </div>

          <form onSubmit={saveUnit} className="space-y-2 rounded-lg border border-zinc-200 p-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="unitName" className="text-xs">
                  {t("Name")}
                </Label>
                <Input
                  id="unitName"
                  className="mt-1 h-9"
                  value={unitDraft.name}
                  onChange={(event) =>
                    setUnitDraft((draft) => ({ ...draft, name: event.target.value }))
                  }
                  placeholder="Bag"
                />
              </div>
              <div>
                <Label htmlFor="unitAbbreviation" className="text-xs">
                  Abbreviation
                </Label>
                <Input
                  id="unitAbbreviation"
                  className="mt-1 h-9"
                  value={unitDraft.abbreviation}
                  onChange={(event) =>
                    setUnitDraft((draft) => ({ ...draft, abbreviation: event.target.value }))
                  }
                  placeholder="BAG"
                />
              </div>
              <div>
                <Label htmlFor="unitPrecision" className="text-xs">
                  Precision
                </Label>
                <Input
                  id="unitPrecision"
                  type="number"
                  min="0"
                  max="6"
                  className="mt-1 h-9"
                  value={unitDraft.precision}
                  onChange={(event) =>
                    setUnitDraft((draft) => ({ ...draft, precision: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {unitDraft.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUnitDraft(emptyUnit)}
                >
                  <X className="h-3.5 w-3.5" /> {t("Cancel")}
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                disabled={busy || !unitDraft.name.trim() || !unitDraft.abbreviation.trim()}
              >
                {unitDraft.id ? (
                  t("Update unit")
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" /> {t("Add unit")}
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {units.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-500">{t("No units yet.")}</p>
            ) : (
              units.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-800">
                      {unit.name}{" "}
                      <span className="font-mono text-xs text-zinc-500">({unit.abbreviation})</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {unit.precision} decimal place{unit.precision === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {unit.isActive ? (
                      <Badge variant="success">{t("Active")}</Badge>
                    ) : (
                      <Badge variant="muted">{t("Inactive")}</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Edit unit")}
                      onClick={() =>
                        setUnitDraft({
                          id: unit.id,
                          name: unit.name,
                          abbreviation: unit.abbreviation,
                          precision: String(unit.precision),
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void toggleUnit(unit)}>
                      {unit.isActive ? t("Disable") : t("Enable")}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
