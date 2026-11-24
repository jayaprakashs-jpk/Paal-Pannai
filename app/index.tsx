import { Redirect } from 'expo-router';
import { useSettings } from '../src/store/settings';

export default function Index() {
  const { onboarded } = useSettings();
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
