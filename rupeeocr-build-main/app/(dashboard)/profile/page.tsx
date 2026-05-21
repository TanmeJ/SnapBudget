'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Category } from '@/types';
import { CATEGORIES } from '@/types';
import { clearSession, getAuthHeaders, getStoredSession, saveSession } from '@/lib/auth';

type SettingsSection =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'categories'
  | 'export'
  | 'appearance';

type ThemeMode = 'ledger' | 'midnight';
type DensityMode = 'comfortable' | 'compact';

interface NotificationPrefs {
  weeklySummary: boolean;
  scanAlerts: boolean;
  productTips: boolean;
}

interface MerchantOverrideItem {
  id: string;
  merchant: string;
  category: Category;
}

interface AppearancePrefs {
  theme: ThemeMode;
  density: DensityMode;
  reduceMotion: boolean;
}

const PROFILE_STORAGE_KEY = 'rupeeocr.profile';
const NOTIFICATION_STORAGE_KEY = 'rupeeocr.profile.notifications';
const OVERRIDES_STORAGE_KEY = 'rupeeocr.profile.overrides';
const APPEARANCE_STORAGE_KEY = 'rupeeocr.profile.appearance';

const SETTINGS_ITEMS: Array<{
  key: SettingsSection;
  icon: string;
  label: string;
  desc: string;
}> = [
  { key: 'profile', icon: 'person', label: 'Edit Profile', desc: 'Name, email, avatar' },
  { key: 'security', icon: 'lock', label: 'Password & Security', desc: 'Change password, 2FA' },
  { key: 'notifications', icon: 'notifications', label: 'Notifications', desc: 'Email and push preferences' },
  { key: 'categories', icon: 'category', label: 'Default Categories', desc: 'Custom merchant overrides' },
  { key: 'export', icon: 'download', label: 'Export Data', desc: 'Download receipts as CSV' },
  { key: 'appearance', icon: 'palette', label: 'Appearance', desc: 'Theme and display settings' },
];

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getDefaultAppearance(): AppearancePrefs {
  return readLocalJson<AppearancePrefs>(APPEARANCE_STORAGE_KEY, {
    theme: 'ledger',
    density: 'comfortable',
    reduceMotion: false,
  });
}

function applyAppearancePrefs(prefs: AppearancePrefs) {
  document.documentElement.dataset.appearance = prefs.theme;
  document.documentElement.dataset.density = prefs.density;
  document.documentElement.dataset.motion = prefs.reduceMotion ? 'reduced' : 'full';
}

export default function ProfilePage() {
  const router = useRouter();
  const session = getStoredSession();
  const initialEmail = session?.user.email ?? 'your@email.com';
  const defaultName = initialEmail.split('@')[0] || 'SnapBudget User';

  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(initialEmail);
  const [avatarTone, setAvatarTone] = useState('bg-primary-container');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [notifications, setNotifications] = useState<NotificationPrefs>({
    weeklySummary: true,
    scanAlerts: true,
    productTips: false,
  });

  const [overrides, setOverrides] = useState<MerchantOverrideItem[]>([]);
  const [merchantInput, setMerchantInput] = useState('');
  const [merchantCategory, setMerchantCategory] = useState<Category>('other');

  const [appearance, setAppearance] = useState<AppearancePrefs>(getDefaultAppearance);

  useEffect(() => {
    const profile = readLocalJson(PROFILE_STORAGE_KEY, {
      name: defaultName,
      avatarTone: 'bg-primary-container',
    });
    const savedNotifications = readLocalJson<NotificationPrefs>(NOTIFICATION_STORAGE_KEY, {
      weeklySummary: true,
      scanAlerts: true,
      productTips: false,
    });
    const savedOverrides = readLocalJson<MerchantOverrideItem[]>(OVERRIDES_STORAGE_KEY, []);
    setName(profile.name || defaultName);
    setAvatarTone(profile.avatarTone || 'bg-primary-container');
    setNotifications(savedNotifications);
    setOverrides(savedOverrides);
  }, [defaultName]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ name, avatarTone }),
    );
  }, [name, avatarTone]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  }, [overrides]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    applyAppearancePrefs(appearance);
  }, [appearance]);

  const initial = useMemo(() => {
    const source = name.trim() || email.trim() || 'S';
    return source.charAt(0).toUpperCase();
  }, [name, email]);

  const resetMessages = () => {
    setStatus(null);
    setError(null);
  };

  const handleProfileSave = async () => {
    resetMessages();
    if (!session) {
      setError('You need to log in again before updating your profile.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session),
        },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || 'Could not update your profile');
      }

      saveSession({
        user: payload.user,
        access_token: session.access_token,
      });
      setEmail(payload.user.email);
      setStatus('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    resetMessages();
    if (!session) {
      setError('You need to log in again before changing your password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(session),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || 'Could not update your password');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setStatus('Password updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddOverride = () => {
    resetMessages();
    const merchant = merchantInput.trim();
    if (!merchant) {
      setError('Enter a merchant name before saving an override.');
      return;
    }

    const normalized = merchant.toLowerCase();
    const existing = overrides.find((item) => item.merchant.toLowerCase() === normalized);
    if (existing) {
      setOverrides((current) =>
        current.map((item) =>
          item.id === existing.id ? { ...item, category: merchantCategory } : item,
        ),
      );
      setStatus('Merchant override updated.');
    } else {
      setOverrides((current) => [
        {
          id: `${Date.now()}`,
          merchant,
          category: merchantCategory,
        },
        ...current,
      ]);
      setStatus('Merchant override saved.');
    }

    setMerchantInput('');
    setMerchantCategory('other');
  };

  const handleExport = async () => {
    resetMessages();
    if (!session) {
      setError('You need to log in again before exporting.');
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch('/api/receipts', {
        headers: getAuthHeaders(session),
      });
      if (!response.ok) {
        throw new Error('Could not load receipts for export');
      }

      const receipts = (await response.json()) as Array<Record<string, unknown>>;
      const header = ['id', 'merchant', 'amount', 'currency', 'date', 'category', 'user_verified'];
      const rows = receipts.map((receipt) =>
        header
          .map((key) => {
            const value = receipt[key];
            const safe = String(value ?? '').replace(/"/g, '""');
            return `"${safe}"`;
          })
          .join(','),
      );

      const csv = [header.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `snapbudget-receipts-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      setStatus(`Exported ${receipts.length} receipts to CSV.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSignOut = () => {
    clearSession();
    router.replace('/login');
  };

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <section className="space-y-5">
            <div>
              <h3 className="font-headline text-xl font-bold text-on-surface">Edit Profile</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Update the basics your account uses across the app.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full ${avatarTone} flex items-center justify-center`}>
                <span className="font-headline text-2xl font-extrabold text-on-primary-container">{initial}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['bg-primary-container', 'bg-secondary', 'bg-tertiary-container', 'bg-primary-fixed-dim'].map((tone) => (
                  <button
                    key={tone}
                    onClick={() => setAvatarTone(tone)}
                    className={`w-9 h-9 rounded-full ${tone} ${avatarTone === tone ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    aria-label={`Use ${tone} avatar tone`}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Display Name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-xl bg-surface-container px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-on-surface-variant">Email</label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl bg-surface-container px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="name@example.com"
                  type="email"
                />
              </div>
            </div>
            <button
              onClick={handleProfileSave}
              disabled={isSaving}
              className="rounded-full bg-primary-gradient px-6 py-3 text-sm font-bold text-on-primary disabled:opacity-70"
            >
              {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </section>
        );
      case 'security':
        return (
          <section className="space-y-5">
            <div>
              <h3 className="font-headline text-xl font-bold text-on-surface">Password & Security</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Change your login password and keep this account secured.
              </p>
            </div>
            <div className="grid gap-4">
              <input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Current password"
                type="password"
              />
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="New password"
                type="password"
              />
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl bg-surface-container px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Confirm new password"
                type="password"
              />
            </div>
            <div className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
              2FA is not wired yet, but the password change flow is now live.
            </div>
            <button
              onClick={handlePasswordSave}
              disabled={isSaving}
              className="rounded-full bg-primary-gradient px-6 py-3 text-sm font-bold text-on-primary disabled:opacity-70"
            >
              {isSaving ? 'Updating...' : 'Update Password'}
            </button>
          </section>
        );
      case 'notifications':
        return (
          <section className="space-y-5">
            <div>
              <h3 className="font-headline text-xl font-bold text-on-surface">Notifications</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Choose which nudges you want to keep enabled on this device.
              </p>
            </div>
            {[
              ['weeklySummary', 'Weekly summary', 'Get a weekly spending recap.'],
              ['scanAlerts', 'Scan alerts', 'Be reminded when a receipt still needs review.'],
              ['productTips', 'Product tips', 'Receive occasional tips for using SnapBudget better.'],
            ].map(([key, label, desc]) => (
              <div key={key} className="flex items-center justify-between rounded-xl bg-surface-container p-4 gap-4">
                <div>
                  <p className="font-medium text-on-surface">{label}</p>
                  <p className="text-sm text-on-surface-variant mt-1">{desc}</p>
                </div>
                <button
                  onClick={() =>
                    setNotifications((current) => ({
                      ...current,
                      [key]: !current[key as keyof NotificationPrefs],
                    }))
                  }
                  className={`h-7 w-12 rounded-full transition-colors ${
                    notifications[key as keyof NotificationPrefs] ? 'bg-primary' : 'bg-outline-variant'
                  }`}
                  aria-label={`Toggle ${label}`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                      notifications[key as keyof NotificationPrefs] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </section>
        );
      case 'categories':
        return (
          <section className="space-y-5">
            <div>
              <h3 className="font-headline text-xl font-bold text-on-surface">Custom Merchant Overrides</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Save preferred categories for merchants you use often.
              </p>
            </div>
            <div className="grid md:grid-cols-[1fr_220px_auto] gap-3">
              <input
                value={merchantInput}
                onChange={(event) => setMerchantInput(event.target.value)}
                className="rounded-xl bg-surface-container px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Merchant name"
              />
              <select
                value={merchantCategory}
                onChange={(event) => setMerchantCategory(event.target.value as Category)}
                className="rounded-xl bg-surface-container px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddOverride}
                className="rounded-full bg-primary-gradient px-5 py-3 text-sm font-bold text-on-primary"
              >
                Save
              </button>
            </div>
            <div className="space-y-3">
              {overrides.length === 0 ? (
                <div className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
                  No merchant overrides saved yet.
                </div>
              ) : (
                overrides.map((item) => {
                  const categoryLabel = CATEGORIES.find((entry) => entry.id === item.category)?.label || item.category;
                  return (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-surface-container p-4 gap-4">
                      <div>
                        <p className="font-medium text-on-surface">{item.merchant}</p>
                        <p className="text-sm text-on-surface-variant mt-1">{categoryLabel}</p>
                      </div>
                      <button
                        onClick={() => setOverrides((current) => current.filter((entry) => entry.id !== item.id))}
                        className="rounded-full bg-error-container px-4 py-2 text-sm font-semibold text-on-error-container"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        );
      case 'export':
        return (
          <section className="space-y-5">
            <div>
              <h3 className="font-headline text-xl font-bold text-on-surface">Export Data</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Download your current receipts as a CSV file for analysis or backup.
              </p>
            </div>
            <div className="rounded-xl bg-surface-container p-5">
              <p className="font-medium text-on-surface">CSV export includes</p>
              <p className="text-sm text-on-surface-variant mt-2">
                Receipt ID, merchant, amount, currency, date, category, and verification status.
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="rounded-full bg-primary-gradient px-6 py-3 text-sm font-bold text-on-primary disabled:opacity-70"
            >
              {isExporting ? 'Preparing CSV...' : 'Download CSV'}
            </button>
          </section>
        );
      case 'appearance':
        return (
          <section className="space-y-5">
            <div>
              <h3 className="font-headline text-xl font-bold text-on-surface">Appearance</h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Tune the app theme and display feel for this browser.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                ['ledger', 'Ledger Light', 'Bright and clean for daily use.'],
                ['midnight', 'Midnight', 'Darker surfaces for long sessions.'],
              ].map(([value, label, desc]) => (
                <button
                  key={value}
                  onClick={() =>
                    setAppearance((current) => ({
                      ...current,
                      theme: value as ThemeMode,
                    }))
                  }
                  className={`rounded-xl border p-5 text-left ${
                    appearance.theme === value
                      ? 'border-primary bg-surface-container'
                      : 'border-outline-variant/20 bg-surface-container-lowest'
                  }`}
                >
                  <p className="font-semibold text-on-surface">{label}</p>
                  <p className="text-sm text-on-surface-variant mt-1">{desc}</p>
                </button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-surface-container p-4">
                <p className="font-medium text-on-surface">Density</p>
                <div className="mt-3 flex gap-2">
                  {(['comfortable', 'compact'] as DensityMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() =>
                        setAppearance((current) => ({
                          ...current,
                          density: mode,
                        }))
                      }
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        appearance.density === mode
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {mode === 'comfortable' ? 'Comfortable' : 'Compact'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-surface-container p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-on-surface">Reduce motion</p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    Minimize animated transitions.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setAppearance((current) => ({
                      ...current,
                      reduceMotion: !current.reduceMotion,
                    }))
                  }
                  className={`h-7 w-12 rounded-full transition-colors ${
                    appearance.reduceMotion ? 'bg-primary' : 'bg-outline-variant'
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                      appearance.reduceMotion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>
        );
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 pb-32 animate-fade-in">
      <h2 className="font-headline text-3xl font-extrabold text-on-surface mb-8">Profile</h2>

      <div className="bg-surface-container-lowest rounded-xl p-8 shadow-ambient mb-6">
        <div className="flex items-center gap-5">
          <div className={`w-16 h-16 rounded-full ${avatarTone} flex items-center justify-center`}>
            <span className="font-headline text-2xl font-extrabold text-on-primary-container">{initial}</span>
          </div>
          <div>
            <h3 className="font-headline text-xl font-bold text-on-surface">{name || 'SnapBudget User'}</h3>
            <p className="text-on-surface-variant text-sm">{email}</p>
            <span className="inline-block mt-2 px-3 py-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-wider rounded-full">
              Free Plan
            </span>
          </div>
        </div>
      </div>

      {(status || error) && (
        <div
          className={`mb-6 rounded-xl px-4 py-3 text-sm ${
            error
              ? 'bg-error-container text-on-error-container'
              : 'bg-secondary-container text-on-secondary-container'
          }`}
        >
          {error || status}
        </div>
      )}

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <div className="bg-surface-container-lowest rounded-xl shadow-ambient overflow-hidden h-fit">
          <div className="divide-y divide-outline-variant/10">
            {SETTINGS_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  resetMessages();
                  setActiveSection(item.key);
                }}
                className={`w-full flex items-center gap-4 p-5 transition-colors text-left ${
                  activeSection === item.key ? 'bg-surface-container-low' : 'hover:bg-surface-container-low'
                }`}
              >
                <div className="w-10 h-10 bg-surface-container rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant">{item.icon}</span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-on-surface">{item.label}</p>
                  <p className="text-xs text-on-surface-variant">{item.desc}</p>
                </div>
                <span className="material-symbols-outlined text-outline">chevron_right</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-ambient">
          {renderActiveSection()}
        </div>
      </div>

      <div className="mt-8">
        <button
          onClick={handleSignOut}
          className="w-full py-4 text-center text-error font-semibold text-sm hover:bg-error-container/30 rounded-xl transition-colors"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
