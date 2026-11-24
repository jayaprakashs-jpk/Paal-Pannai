import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Btn, Card, Field, Screen, Txt, Spacer, Banner, toast, confirm } from '../src/ui';
import { Title } from '../src/ui/Title';
import { useT } from '../src/i18n';
import { signIn, signUp } from '../src/services/auth';
import { supabase, isCloudConfigured } from '../src/services/supabase';
import { getSettings } from '../src/store/settings';
import { getFarm } from '../src/db/repo';
import { kvGet, wipeAll } from '../src/db/client';
import { syncNow } from '../src/services/sync';
import { useBusy } from '../src/lib/hooks';

export default function Auth() {
  const t = useT();
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const { busy, run } = useBusy();

  const submit = (mode: 'in' | 'up') => run(async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast(t('Check email'), t('Enter a valid email address.'));
    if (pw.length < 8) return toast(t('Password'), t('Use at least 8 characters.'));
    const err = mode === 'in' ? await signIn(email, pw) : await signUp(email, pw);
    if (err) return toast(mode === 'in' ? t('Sign in failed') : t('Sign up'), t(err));
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;

    // A different account signing in on a phone that holds someone else's data must not merge them.
    const prev = await kvGet('sync.user');
    if (prev && prev !== uid) {
      const ok = await confirm(t('Different account'),
        t('This phone has data from another account. To continue, it must be cleared from this phone (it stays in the cloud for that account).'),
        t('Clear and continue'), t('Cancel'), true);
      if (!ok) { await supabase.auth.signOut(); return; }
      await wipeAll();
    }
    const farm = await getFarm();
    await supabase.rpc('set_my_profile', { p_role: getSettings().role, p_name: farm?.owner_name ?? '', p_phone: farm?.phone ?? '' });
    syncNow().catch(() => {});
    r.back();
  });

  return (
    <Screen>
      <Title>{t('Sign in')}</Title>
      {!isCloudConfigured ? (
        <Banner tone="warn" text={t('Cloud is not set up in this build. The app works fully offline.')} />
      ) : null}
      <Card>
        <Txt v="small" style={{ marginBottom: S_GAP }}>{t('Sign in to back up your data, use the marketplace and home delivery. Farm records still work without internet.')}</Txt>
        <Field label={t('Email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label={t('Password')} value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" />
        <Btn title={t('Sign in')} onPress={() => submit('in')} loading={busy} disabled={!isCloudConfigured} />
        <Spacer h={8} />
        <Btn v="ghost" title={t('Create account')} onPress={() => submit('up')} disabled={busy || !isCloudConfigured} />
      </Card>
    </Screen>
  );
}
const S_GAP = 12;
