import { ProviderPanel } from "@/features/settings/ProviderPanel";
import { SettingsForm } from "@/features/settings/SettingsForm";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Settings · Retrace" };

export default function SettingsPage() {
  const { activeProvider: _active, ...settings } = getSettings();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Saved on this computer and used from the next request.
        </p>
      </header>
      <ProviderPanel />
      <SettingsForm initial={settings} />
    </div>
  );
}
