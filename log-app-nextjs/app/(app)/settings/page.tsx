'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api, ApiError } from '@/src/api/client';
import type { UserProfile } from '@/src/api/types';
import { SettingField } from '@/src/components/SettingField';

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then(setProfile)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  async function save(key: 'protein_target_g' | 'calorie_target', value: number | null) {
    const updated = await api.updateMe(
      key === 'protein_target_g' ? { protein_target_g: value } : { calorie_target: value },
    );
    setProfile(updated);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link href="/today" aria-label="Back" className="p-1 text-chalkDim hover:text-chalk">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-[28px] font-semibold tracking-[0.5px] text-chalk">
          Settings
        </h1>
      </div>

      {loading && <p className="mt-4 font-mono text-sm text-steel">Loading…</p>}
      {error && <p className="mt-4 font-mono text-sm text-rustSoft">{error}</p>}

      {profile && (
        <div className="mt-5 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-chalkDim">
            Targets
          </div>
          <SettingField
            label="Protein target"
            unit="g"
            value={profile.protein_target_g}
            hint="Powers the adherence signal in Trends and your weekly verdict."
            onSave={(v) => save('protein_target_g', v)}
          />
          <SettingField
            label="Calorie target"
            unit="kcal"
            value={profile.calorie_target}
            hint="Used as a reference in your daily log."
            onSave={(v) => save('calorie_target', v)}
          />
        </div>
      )}
    </div>
  );
}
