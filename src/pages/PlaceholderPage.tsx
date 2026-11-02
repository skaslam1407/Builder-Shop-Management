import { Construction, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/i18n";

interface PlaceholderPageProps {
  title: string;
  description: string;
  items: string[];
}

export function PlaceholderPage({ title, description, items }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-900">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Construction className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-zinc-900">{t("Planned for the next build phase")}</p>
                <Badge variant="muted">{t("Not yet available")}</Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                The database schema, permissions, and audit tables already support this module.
                The Rust commands and UI are implemented in a later increment so each financial
                workflow can be tested in isolation.
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-zinc-600">
                <Circle className="h-2 w-2 fill-zinc-300 text-zinc-300" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
