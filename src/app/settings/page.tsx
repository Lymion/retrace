import { PageHeader } from "@/components/terminal";
import { ProviderPanel } from "@/features/settings/ProviderPanel";
import { SettingsForm } from "@/features/settings/SettingsForm";
import { DesktopPanel } from "@/features/settings/DesktopPanel";
import { UsagePanel } from "@/features/settings/UsagePanel";
import { dataDir } from "@/db/client";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Settings · Retrace" };

export default function SettingsPage() {
  const { activeProvider: _active, ...settings } = getSettings();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-7 p-4 sm:p-6">
      <PageHeader path={[{ label: "settings" }]} title="Settings">
        Saved on this computer and used from the next request.
      </PageHeader>
      <ProviderPanel />
      <SettingsForm initial={settings} />
      <UsagePanel />
      {process.env.RETRACE_DESKTOP_SECRET && (
        <DesktopPanel
          folder={dataDir()}
          version={process.env.RETRACE_APP_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION ?? ""}
        />
      )}
    </div>
  );
}
