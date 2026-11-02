import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Globe2, KeyRound, Languages, ShieldCheck } from "lucide-react";
import { companyApi, getErrorMessage, preferencesApi } from "@/lib/api";
import { languageOptions, useT } from "@/lib/i18n";
import type {
  CompanySettings,
  CompanySettingsInput,
  CurrencyCode,
  LanguageCode,
  UserPreferences,
} from "@/lib/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ErrorBanner, SuccessBanner } from "@/components/ui/feedback";

function languageLabel(language: LanguageCode): string {
  return languageOptions.find((option) => option.value === language)?.label ?? language;
}

const monthOptions = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toForm(settings: CompanySettings): CompanySettingsInput {
  return {
    companyName: settings.companyName,
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    gstin: settings.gstin ?? "",
    stateCode: settings.stateCode ?? "",
    invoiceFooter: settings.invoiceFooter ?? "",
    languageCode: settings.languageCode,
    currencyCode: settings.currencyCode,
    pricesIncludeTax: settings.pricesIncludeTax,
    gstInvoicePrefix: settings.gstInvoicePrefix,
    nonGstInvoicePrefix: settings.nonGstInvoicePrefix,
    fiscalYearStartMonth: settings.fiscalYearStartMonth,
    allowNegativeStock: settings.allowNegativeStock,
  };
}

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const refresh = useAuthStore((state) => state.refresh);
  const t = useT();
  const canManage = Boolean(user?.permissions.includes("settings.manage"));

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [languageOverride, setLanguageOverride] = useState<LanguageCode | "">("");
  const [currencyOverride, setCurrencyOverride] = useState<CurrencyCode | "">("");
  const [companyForm, setCompanyForm] = useState<CompanySettingsInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const applyPreferences = (next: UserPreferences) => {
    setPreferences(next);
    setLanguageOverride(next.languageOverride ?? "");
    setCurrencyOverride(next.currencyOverride ?? "");
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      preferencesApi.get(),
      canManage ? companyApi.get() : Promise.resolve(null),
    ])
      .then(([result, settings]) => {
        if (!active) return;
        applyPreferences(result);
        if (settings) setCompanyForm(toForm(settings));
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [canManage]);

  const savePreferences = async () => {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const result = await preferencesApi.update(
        languageOverride || null,
        currencyOverride || null,
      );
      applyPreferences(result);
      if (user) {
        setUser({ ...user, language: result.language, currencyCode: result.currencyCode });
      }
      setSaved(t("Preferences saved."));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveCompanyDefaults = async () => {
    if (!companyForm) return;
    setSavingCompany(true);
    setError(null);
    setSaved(null);
    try {
      const optional = (value?: string) => (value?.trim() ? value.trim() : undefined);
      const result = await companyApi.update({
        ...companyForm,
        companyName: companyForm.companyName.trim(),
        address: optional(companyForm.address),
        phone: optional(companyForm.phone),
        email: optional(companyForm.email),
        gstin: optional(companyForm.gstin),
        stateCode: optional(companyForm.stateCode),
        invoiceFooter: optional(companyForm.invoiceFooter),
        gstInvoicePrefix: companyForm.gstInvoicePrefix.trim().toUpperCase(),
        nonGstInvoicePrefix: companyForm.nonGstInvoicePrefix.trim().toUpperCase(),
      });
      setCompanyForm(toForm(result));
      await refresh();
      applyPreferences(await preferencesApi.get());
      setSaved(t("Company settings saved."));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingCompany(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-900">{t("Settings")}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {t("Account security and company configuration for this installation.")}
        </p>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {saved ? <SuccessBanner message={saved} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <CardTitle>{t("Signed-in account")}</CardTitle>
            </div>
            <CardDescription>{t("Your identity and effective permissions.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">{t("Display name")}</p>
                <p className="mt-1 font-medium text-zinc-900">{user?.displayName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">{t("Username")}</p>
                <p className="mt-1 font-mono text-zinc-900">{user?.username}</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {t("Permissions")} ({user?.permissions.length ?? 0})
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {user?.permissions.map((permission) => (
                  <Badge key={permission} variant="outline" className="font-mono text-[10px]">
                    {permission}
                  </Badge>
                ))}
              </div>
            </div>
            <Link to="/change-password">
              <Button variant="outline" size="sm">
                <KeyRound className="h-3.5 w-3.5" /> {t("Change password")}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-brand-600" />
              <CardTitle>{t("Language & currency")}</CardTitle>
            </div>
            <CardDescription>{t("Your personal display preferences.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="preferredLanguage">{t("Language")}</Label>
              <Select
                id="preferredLanguage"
                className="mt-1.5"
                value={languageOverride}
                onChange={(event) =>
                  setLanguageOverride(event.target.value as LanguageCode | "")
                }
              >
                <option value="">
                  {t("Use company default")} ({languageLabel(preferences?.companyLanguage ?? "en")})
                </option>
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="preferredCurrency">{t("Currency")}</Label>
              <Select
                id="preferredCurrency"
                className="mt-1.5"
                value={currencyOverride}
                onChange={(event) =>
                  setCurrencyOverride(event.target.value as CurrencyCode | "")
                }
              >
                <option value="">
                  {t("Use company default")} ({preferences?.companyCurrencyCode ?? "INR"})
                </option>
                <option value="INR">INR — Indian Rupee (₹)</option>
              </Select>
            </div>
            <p className="text-xs text-zinc-500">
              {t("Amounts are stored in Indian rupees. Currency selection changes display formatting only.")}
            </p>
            <Button onClick={() => void savePreferences()} disabled={saving || !preferences}>
              <Globe2 className="h-4 w-4" />
              {saving ? t("Saving…") : t("Save preferences")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand-600" />
              <CardTitle>{t("Company settings")}</CardTitle>
            </div>
            <CardDescription>
              {t("Legal identity, invoice defaults, and localization for this installation.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {companyForm ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="companyName">{t("Company name")}</Label>
                    <Input
                      id="companyName"
                      className="mt-1.5"
                      value={companyForm.companyName}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, companyName: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyPhone">{t("Phone")}</Label>
                    <Input
                      id="companyPhone"
                      className="mt-1.5"
                      value={companyForm.phone ?? ""}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, phone: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyEmail">{t("Email")}</Label>
                    <Input
                      id="companyEmail"
                      className="mt-1.5"
                      value={companyForm.email ?? ""}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, email: event.target.value })
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="companyAddress">{t("Address")}</Label>
                    <Textarea
                      id="companyAddress"
                      className="mt-1.5"
                      rows={2}
                      value={companyForm.address ?? ""}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, address: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyGstin">{t("GSTIN")}</Label>
                    <Input
                      id="companyGstin"
                      className="mt-1.5 font-mono uppercase"
                      value={companyForm.gstin ?? ""}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, gstin: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyState">{t("State code")}</Label>
                    <Input
                      id="companyState"
                      className="mt-1.5 font-mono"
                      maxLength={2}
                      value={companyForm.stateCode ?? ""}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, stateCode: event.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="gstPrefix">{t("GST invoice prefix")}</Label>
                    <Input
                      id="gstPrefix"
                      className="mt-1.5 font-mono uppercase"
                      value={companyForm.gstInvoicePrefix}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          gstInvoicePrefix: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="nonGstPrefix">{t("Non-GST invoice prefix")}</Label>
                    <Input
                      id="nonGstPrefix"
                      className="mt-1.5 font-mono uppercase"
                      value={companyForm.nonGstInvoicePrefix}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          nonGstInvoicePrefix: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="fiscalMonth">{t("Fiscal year starts")}</Label>
                    <Select
                      id="fiscalMonth"
                      className="mt-1.5"
                      value={companyForm.fiscalYearStartMonth}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          fiscalYearStartMonth: Number(event.target.value),
                        })
                      }
                    >
                      {monthOptions.map((month, index) => (
                        <option key={month} value={index + 1}>
                          {t(month)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="companyCurrency">{t("Currency")}</Label>
                    <Select
                      id="companyCurrency"
                      className="mt-1.5"
                      value={companyForm.currencyCode}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, currencyCode: event.target.value })
                      }
                    >
                      <option value="INR">INR — Indian Rupee (₹)</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="companyLanguage">{t("Default language")}</Label>
                    <Select
                      id="companyLanguage"
                      className="mt-1.5"
                      value={companyForm.languageCode}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, languageCode: event.target.value })
                      }
                    >
                      {languageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Label htmlFor="invoiceFooter">{t("Invoice footer")}</Label>
                    <Input
                      id="invoiceFooter"
                      className="mt-1.5"
                      value={companyForm.invoiceFooter ?? ""}
                      onChange={(event) =>
                        setCompanyForm({ ...companyForm, invoiceFooter: event.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-5 border-t border-zinc-100 pt-4 text-sm text-zinc-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
                      checked={companyForm.pricesIncludeTax}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          pricesIncludeTax: event.target.checked,
                        })
                      }
                    />
                    {t("Item prices include tax")}
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 accent-brand-600"
                      checked={companyForm.allowNegativeStock}
                      onChange={(event) =>
                        setCompanyForm({
                          ...companyForm,
                          allowNegativeStock: event.target.checked,
                        })
                      }
                    />
                    {t("Allow negative stock")}
                  </label>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => void saveCompanyDefaults()}
                    disabled={savingCompany || !companyForm.companyName.trim()}
                  >
                    {savingCompany ? t("Saving…") : t("Save company settings")}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">{t("Loading company settings…")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("Data and security")}</CardTitle>
          <CardDescription>{t("How this build protects shop records.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-zinc-600 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium text-zinc-900">{t("Local-only database")}</p>
            <p className="mt-1 text-xs">
              {t("SQLite lives in the application data directory. The frontend never runs SQL.")}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium text-zinc-900">{t("Argon2id passwords")}</p>
            <p className="mt-1 text-xs">
              {t("Password hashes use Argon2id with a unique salt. Plaintext passwords are never stored.")}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4">
            <p className="font-medium text-zinc-900">{t("Audited changes")}</p>
            <p className="mt-1 text-xs">
              {t("Logins, master-data changes, and financial actions are written to the audit log.")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
