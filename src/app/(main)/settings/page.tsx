'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { ProfileSection } from '@/components/settings/profile-section';
import { AppearanceSection } from '@/components/settings/appearance-section';
import { NotificationsSection } from '@/components/settings/notifications-section';
import { PrivacySection } from '@/components/settings/privacy-section';
import { SecuritySection } from '@/components/settings/security-section';

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{title}</h2>
      <div className="rounded-2xl border border-border bg-surface p-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="nova-scroll flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <IconButton aria-label="Back" onClick={() => router.push('/chats')}>
          <ArrowLeft size={18} />
        </IconButton>
        <p className="text-sm font-semibold text-foreground">Settings</p>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-6 py-6">
        <SettingsCard title="Profile">
          <ProfileSection />
        </SettingsCard>

        <SettingsCard title="Appearance">
          <AppearanceSection />
        </SettingsCard>

        <SettingsCard title="Notifications">
          <NotificationsSection />
        </SettingsCard>

        <SettingsCard title="Privacy · Blocked users">
          <PrivacySection />
        </SettingsCard>

        <SettingsCard title="Security">
          <SecuritySection />
        </SettingsCard>
      </div>
    </div>
  );
}
