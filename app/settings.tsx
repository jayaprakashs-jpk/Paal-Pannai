import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Btn, Card, Chips, KV, Screen, SectionTitle, Spacer, Toggle, Txt, toast, confirm, Banner, C } from '../src/ui';
import { Title } from '../src/ui/Title';
import { useT } from '../src/i18n';
import { Lang, Role, setSettings, useSettings } from '../src/store/settings';
import { ROLES } from '../src/lib/constants';
import { useSession, signOut } from '../src/services/auth';
import { isCloudConfigured, supabase } from '../src/services/supabase';
import { pendingCount, syncNow } from '../src/services/sync';
import { useLoad, useBusy } from '../src/lib/hooks';
import { exportBackup } from '../src/services/backup';
import { fmtDateTime } from '../src/lib/dates';
import { wipeAll } from '../src/db/client';
import { getFarm } from '../src/db/repo';

export default function Settings() {
  const t = useT();
  const r = useRouter();
  const s = useSettings();
  const session = useSession();
  const { data: pending, reload } = useLoad(pendingCount, 0, []);
  const { busy, run } = useBusy();
  const [msg, setMsg] = useState<string | null>(null);

  const doSync = () => run(async () => {
    const rep = await syncNow();
    if (rep.skipped === 'account_mismatch') setMsg(t('This phone holds data of another account. Clear this phone data to use this account.'));
    else if (rep.skipped === 'offline') setMsg(t('No internet right now. Your data is safe on this phone and will sync later.'));
    else if (rep.skipped === 'signed_out') setMsg(t('Sign in first.'));
    else if (rep.skipped === 'not_configured') setMsg(t('Cloud is not set up in this build.'));
    else if (rep.ok) setMsg(t('Synced. Sent {a}, received {b}.', { a: rep.pushed, b: rep.pulled }));
    else setMsg(rep.errors.slice(0, 3).join('\n'));
    await reload();
  });

  const changeRole = async (role: Role) => {
    await setSettings({ role });
    if (supabase && session) {
      const farm = await getFarm();
      await supabase.rpc('set_my_profile', { p_role: role, p_name: farm?.owner_name ?? '', p_phone: farm?.phone ?? '' });
    }
  };

  return (
    <Screen>
      <Title>{t('Settings & sync')}</Title>
      <Card>
        <Chips label={t('Language')} value={s.lang} onChange={v => setSettings({ lang: v as Lang })} translate={false}
          options={[{ value: 'en', label: 'English' }, { value: 'ta', label: 'தமிழ்' }]} />
        <Chips label={t('I am a')} value={s.role} onChange={v => changeRole(v as Role)} options={ROLES.map(x => ({ value: x.key, label: x.label }))} />
        <Chips label={t('Measurement unit')} value={s.lengthUnit} onChange={v => setSettings({ lengthUnit: v as 'cm' | 'in' })}
          options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'inch' }]} />
        <Toggle label={t('Weather and heat alerts')} value={s.weatherAlerts} onChange={v => setSettings({ weatherAlerts: v })} />
      </Card>

      <SectionTitle>{t('Cloud backup & sync')}</SectionTitle>
      {!isCloudConfigured ? <Banner tone="warn" text={t('Cloud is not set up in this build. Use Export backup below.')} /> : null}
      <Card>
        <KV k={t('Account')} v={session?.user.email ?? t('Not signed in')} />
        <KV k={t('Waiting to upload')} v={String(pending)} color={pending ? C.warn : C.ok} />
        <KV k={t('Last sync')} v={s.lastSyncAt ? fmtDateTime(s.lastSyncAt) : '-'} />
        {msg ? <Txt v="small" style={{ marginTop: 8 }}>{msg}</Txt> : null}
        <Spacer />
        {session ? (
          <>
            <Btn icon="sync" title={t('Sync now')} onPress={doSync} loading={busy} />
            <Spacer h={8} />
            <Btn v="ghost" title={t('Sign out')} onPress={async () => {
              if (pending > 0) {
                const ok = await confirm(t('Unsynced data'), t('{n} changes are not uploaded yet. They stay on this phone but are not backed up. Sign out anyway?', { n: pending }), t('Sign out'), t('Cancel'), true);
                if (!ok) return;
              }
              await signOut();
            }} />
          </>
        ) : (
          <Btn icon="login" title={t('Sign in')} onPress={() => r.push('/auth')} disabled={!isCloudConfigured} />
        )}
      </Card>

      <SectionTitle>{t('Your data')}</SectionTitle>
      <Card>
        <Btn v="secondary" icon="export" title={t('Export backup (JSON)')} onPress={() => run(async () => { try { await exportBackup(); } catch (e: any) { toast(t('Backup failed'), String(e?.message ?? e)); } })} />
        <Spacer h={8} />
        <Btn v="danger" icon="delete-forever" title={t('Erase all data on this phone')} onPress={async () => {
          const ok = await confirm(t('Erase everything?'), t('This deletes all animals, milk and bills on this phone. Synced data stays in the cloud. This cannot be undone.'), t('Erase'), t('Cancel'), true);
          if (!ok) return;
          await wipeAll();
          await setSettings({ onboarded: false, lastSyncAt: null });
          r.replace('/onboarding');
        }} />
      </Card>
      <Spacer />
      <Txt v="small" style={{ textAlign: 'center' }}>Paal Pannai 1.0</Txt>
    </Screen>
  );
}
