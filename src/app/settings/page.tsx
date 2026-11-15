import { PageHeader } from "@/components/terminal";
import { ProviderPanel } from "@/features/settings/ProviderPanel";
import { SettingsForm } from "@/features/settings/SettingsForm";
import { UsagePanel } from "@/features/settings/UsagePanel";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Settings · Retrace" };

export default function SettingsPage() {
  const { activeProvider: _active, ...settings } = getSettings();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <PageHeader path={[{ label: "settings" }]} title="Settings">
        Saved on this computer and used from the next request.
      </PageHeader>
      <ProviderPanel />
      <SettingsForm initial={settings} />
      <UsagePanel />
    </div>
  );
}
