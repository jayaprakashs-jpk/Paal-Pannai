import React, { ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle, KeyboardTypeOptions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S } from './theme';
import { useT } from '../i18n';
import { fmtDate, pad2, toISODate, parseISODate } from '../lib/dates';

export { C, R, S };

// ---------------- Icon ----------------
export function Icon({ name, size = 22, color = C.text }: { name: string; size?: number; color?: any }) {
  return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
}

// ---------------- Text ----------------
type Variant = 'title' | 'h2' | 'body' | 'small' | 'label' | 'big';
const TS: Record<Variant, TextStyle> = {
  title: { fontSize: 24, fontWeight: '700', color: C.text },
  h2: { fontSize: 18, fontWeight: '700', color: C.text },
  body: { fontSize: 16, color: C.text },
  small: { fontSize: 13, color: C.sub },
  label: { fontSize: 14, fontWeight: '600', color: C.sub },
  big: { fontSize: 28, fontWeight: '800', color: C.text },
};
export function Txt({ v = 'body', style, children, color, numberOfLines }: {
  v?: Variant; style?: StyleProp<TextStyle>; children?: ReactNode; color?: string; numberOfLines?: number;
}) {
  return <Text numberOfLines={numberOfLines} style={[TS[v], color ? { color } : null, style]}>{children}</Text>;
}

// ---------------- Layout ----------------
export function Screen({ children, scroll = true, pad = true, footer }: {
  children: ReactNode; scroll?: boolean; pad?: boolean; footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: pad ? S.lg : 0, paddingBottom: S.xl * 2 }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: pad ? S.lg : 0 }}>{children}</View>
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, S.md) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress, tone }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: 'warn' | 'danger' | 'ok' | 'info';
}) {
  const toneStyle = tone === 'warn' ? { backgroundColor: C.warnSoft, borderColor: C.warn }
    : tone === 'danger' ? { backgroundColor: C.dangerSoft, borderColor: C.danger }
    : tone === 'ok' ? { backgroundColor: C.primarySoft, borderColor: C.ok }
    : tone === 'info' ? { backgroundColor: C.infoSoft, borderColor: C.info } : null;
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, toneStyle, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export const Row = ({ children, style, gap = S.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>
);
export const Spacer = ({ h = S.md }: { h?: number }) => <View style={{ height: h }} />;

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: S.lg, marginBottom: S.sm }}>
      <Txt v="h2">{children}</Txt>
      {right}
    </Row>
  );
}

export function KV({ k, v, bold, color }: { k: string; v: ReactNode; bold?: boolean; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
      <Txt v="small" style={{ flex: 1 }}>{k}</Txt>
      <Txt style={{ fontWeight: bold ? '700' : '500', color: color ?? C.text, flexShrink: 1, textAlign: 'right' }}>{v}</Txt>
    </Row>
  );
}

export function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={styles.stat}>
      <Txt v="small">{label}</Txt>
      <Txt v="h2" style={{ color: color ?? C.text }}>{value}</Txt>
      {sub ? <Txt v="small">{sub}</Txt> : null}
    </View>
  );
}

export function Badge({ text, tone = 'info' }: { text: string; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }) {
  const m = {
    ok: [C.primarySoft, C.ok], warn: [C.warnSoft, C.warn], danger: [C.dangerSoft, C.danger],
    info: [C.infoSoft, C.info], muted: ['#EEE', C.sub],
  }[tone];
  return (
    <View style={{ backgroundColor: m[0], borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: m[1], fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Empty({ icon = 'tray', text, action }: { icon?: string; text: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: S.xl, gap: S.sm }}>
      <Icon name={icon} size={44} color={C.border} />
      <Txt v="small" style={{ textAlign: 'center' }}>{text}</Txt>
      {action}
    </View>
  );
}

export function Banner({ text, tone = 'info', action }: { text: string; tone?: 'info' | 'warn' | 'danger' | 'ok'; action?: ReactNode }) {
  return (
    <Card tone={tone} style={{ marginBottom: S.md }}>
      <Txt v="small" style={{ color: C.text }}>{text}</Txt>
      {action}
    </Card>
  );
}

export function Loading() {
  return <View style={{ padding: S.xl }}><ActivityIndicator color={C.primary} /></View>;
}

// ---------------- Buttons ----------------
export function Btn({ title, onPress, v = 'primary', icon, loading, disabled, small, style }: {
  title: string; onPress: () => void; v?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  icon?: string; loading?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = v === 'primary' ? C.primary : v === 'danger' ? C.danger : v === 'accent' ? C.accent
    : v === 'secondary' ? C.primarySoft : 'transparent';
  const fg = v === 'primary' || v === 'danger' ? C.white : v === 'accent' ? C.text : C.primary;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn, { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1, paddingVertical: small ? 8 : 13 },
        v === 'ghost' && { borderWidth: 1, borderColor: C.border }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <Row gap={6}>
          {icon ? <Icon name={icon} size={small ? 18 : 20} color={fg} /> : null}
          <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function Fab({ onPress, icon = 'plus' }: { onPress: () => void; icon?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.fab}>
      <Icon name={icon} size={28} color={C.white} />
    </Pressable>
  );
}

export function ListItem({ title, subtitle, right, icon, onPress, tone, badge }: {
  title: string; subtitle?: string; right?: ReactNode; icon?: string; onPress?: () => void;
  tone?: 'warn' | 'danger' | 'ok'; badge?: ReactNode;
}) {
  return (
    <Card onPress={onPress} tone={tone} style={{ marginBottom: S.sm }}>
      <Row gap={S.md}>
        {icon ? (
          <View style={styles.iconCircle}><Icon name={icon} size={22} color={C.primary} /></View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Row style={{ flexWrap: 'wrap' }}>
            <Txt style={{ fontWeight: '700' }}>{title}</Txt>
            {badge}
          </Row>
          {subtitle ? <Txt v="small">{subtitle}</Txt> : null}
        </View>
        {right}
        {onPress && !right ? <Icon name="chevron-right" color={C.sub} /> : null}
      </Row>
    </Card>
  );
}

// ---------------- Inputs ----------------
export function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline, suffix, error, editable = true, autoCapitalize, maxLength, secureTextEntry,
}: {
  label?: string; value: string; onChangeText: (s: string) => void; placeholder?: string;
  keyboardType?: KeyboardTypeOptions; multiline?: boolean; suffix?: string; error?: string; editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words'; maxLength?: number; secureTextEntry?: boolean;
}) {
  return (
    <View style={{ marginBottom: S.md }}>
      {label ? <Txt v="label" style={{ marginBottom: 4 }}>{label}</Txt> : null}
      <View style={[styles.inputWrap, error ? { borderColor: C.danger } : null, !editable && { backgroundColor: '#F0F0F0' }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9AA59C"
          keyboardType={keyboardType}
          multiline={multiline}
          editable={editable}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          secureTextEntry={secureTextEntry}
          style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        />
        {suffix ? <Txt v="small" style={{ marginRight: 10 }}>{suffix}</Txt> : null}
      </View>
      {error ? <Txt v="small" color={C.danger}>{error}</Txt> : null}
    </View>
  );
}

export const NumField = (p: Omit<Parameters<typeof Field>[0], 'keyboardType'>) => (
  <Field {...p} keyboardType="decimal-pad" />
);

export function DateField({ label, value, onChange, mode = 'date', clearable }: {
  label?: string; value: string | null | undefined; onChange: (iso: string) => void;
  mode?: 'date' | 'time' | 'datetime'; clearable?: boolean;
}) {
  const t = useT();
  const current = useMemo(() => {
    if (!value) return new Date();
    if (mode === 'time') {
      const m = /^(\d{1,2}):(\d{2})$/.exec(value);
      const d = new Date();
      if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
      return d;
    }
    return value.length > 10 ? new Date(value) : parseISODate(value);
  }, [value, mode]);

  const open = () => {
    const base = isNaN(current.getTime()) ? new Date() : current;
    const pickDate = (then: (d: Date) => void) =>
      DateTimePickerAndroid.open({
        value: base, mode: 'date',
        onChange: (e, d) => { if (e.type === 'set' && d) then(d); },
      });
    const pickTime = (d0: Date, then: (d: Date) => void) =>
      DateTimePickerAndroid.open({
        value: d0, mode: 'time', is24Hour: false,
        onChange: (e, d) => { if (e.type === 'set' && d) then(d); },
      });
    if (mode === 'date') pickDate(d => onChange(toISODate(d)));
    else if (mode === 'time') pickTime(base, d => onChange(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`));
    else pickDate(d => pickTime(d, d2 => {
      const full = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d2.getHours(), d2.getMinutes());
      onChange(full.toISOString());
    }));
  };

  const text = !value ? t('Select') : mode === 'time' ? value
    : mode === 'datetime' ? `${fmtDate(value)} ${pad2(new Date(value).getHours())}:${pad2(new Date(value).getMinutes())}`
    : fmtDate(value);

  return (
    <View style={{ marginBottom: S.md }}>
      {label ? <Txt v="label" style={{ marginBottom: 4 }}>{label}</Txt> : null}
      <Pressable onPress={open} style={[styles.inputWrap, { paddingVertical: 13, paddingHorizontal: 12, justifyContent: 'space-between' }]}>
        <Txt style={{ color: value ? C.text : '#9AA59C' }}>{text}</Txt>
        <Row>
          {clearable && value ? (
            <Pressable onPress={() => onChange('')} hitSlop={10}><Icon name="close-circle" size={20} color={C.sub} /></Pressable>
          ) : null}
          <Icon name={mode === 'time' ? 'clock-outline' : 'calendar'} size={20} color={C.sub} />
        </Row>
      </Pressable>
    </View>
  );
}

export interface Opt { value: string; label: string; icon?: string }

/** Chips: for short lists (<= ~8). */
export function Chips({ label, options, value, onChange, translate = true }: {
  label?: string; options: Opt[]; value: string | null | undefined; onChange: (v: string) => void; translate?: boolean;
}) {
  const t = useT();
  return (
    <View style={{ marginBottom: S.md }}>
      {label ? <Txt v="label" style={{ marginBottom: 6 }}>{label}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)}
              style={[styles.chip, on && { backgroundColor: C.primary, borderColor: C.primary }]}>
              {o.icon ? <Icon name={o.icon} size={16} color={on ? C.white : C.primary} /> : null}
              <Text style={{ color: on ? C.white : C.text, fontWeight: '600' }}>{translate ? t(o.label) : o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Modal picker with search: for long lists (animals, buyers...). */
export function PickerField({ label, options, value, onChange, placeholder, allowEmpty }: {
  label?: string; options: Opt[]; value: string | null | undefined; onChange: (v: string) => void;
  placeholder?: string; allowEmpty?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ marginBottom: S.md }}>
      {label ? <Txt v="label" style={{ marginBottom: 4 }}>{label}</Txt> : null}
      <Pressable onPress={() => setOpen(true)} style={[styles.inputWrap, { paddingVertical: 13, paddingHorizontal: 12, justifyContent: 'space-between' }]}>
        <Txt style={{ color: sel ? C.text : '#9AA59C', flex: 1 }} numberOfLines={1}>{sel ? sel.label : placeholder ?? t('Select')}</Txt>
        <Icon name="menu-down" color={C.sub} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, padding: S.lg, paddingTop: S.xl * 1.5 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: S.md }}>
            <Txt v="h2">{label ?? t('Select')}</Txt>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}><Icon name="close" size={26} /></Pressable>
          </Row>
          {options.length > 8 ? <Field value={q} onChangeText={setQ} placeholder={t('Search')} /> : null}
          <FlatList
            data={filtered}
            keyExtractor={o => o.value}
            ListHeaderComponent={allowEmpty ? (
              <Pressable style={styles.pickRow} onPress={() => { onChange(''); setOpen(false); }}>
                <Txt color={C.sub}>{t('None')}</Txt>
              </Pressable>
            ) : undefined}
            renderItem={({ item }) => (
              <Pressable style={styles.pickRow} onPress={() => { onChange(item.value); setOpen(false); setQ(''); }}>
                <Txt style={{ fontWeight: item.value === value ? '700' : '400' }}>{item.label}</Txt>
                {item.value === value ? <Icon name="check" color={C.primary} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={<Empty text={t('Nothing to show')} />}
          />
        </View>
      </Modal>
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ marginBottom: S.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: '600' }}>{label}</Txt>
          {hint ? <Txt v="small">{hint}</Txt> : null}
        </View>
        <View style={[styles.switch, value && { backgroundColor: C.primary }]}>
          <View style={[styles.knob, value && { alignSelf: 'flex-end' }]} />
        </View>
      </Row>
    </Pressable>
  );
}

// ---------------- Dialogs ----------------
export function confirm(title: string, message: string, okText: string, cancelText: string, danger = false): Promise<boolean> {
  return new Promise(res => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => res(false) },
      { text: okText, style: danger ? 'destructive' : 'default', onPress: () => res(true) },
    ], { cancelable: true, onDismiss: () => res(false) });
  });
}

export function toast(title: string, message?: string) {
  Alert.alert(title, message);
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, borderWidth: 1, borderColor: C.border },
  footer: { padding: S.md, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  btn: { borderRadius: R.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.lg },
  fab: {
    position: 'absolute', right: 18, bottom: 18, width: 58, height: 58, borderRadius: 29,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', elevation: 6,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: R.md,
  },
  input: { flex: 1, fontSize: 16, color: C.text, paddingHorizontal: 12, paddingVertical: 11 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  iconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, backgroundColor: C.card, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border },
  pickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  switch: { width: 50, height: 28, borderRadius: 14, backgroundColor: '#C8D0C6', padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.white, alignSelf: 'flex-start' },
});
