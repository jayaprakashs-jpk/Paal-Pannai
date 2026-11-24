import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';

/** Shrinks an image and stores a permanent copy in the app's document folder. */
export async function persistImage(uri: string, folder: string, width: number): Promise<string> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri).resize({ width });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
  const dir = new Directory(Paths.document, folder);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${folder}_${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`);
  new File(out.uri).copy(dest);
  return dest.uri;
}

export async function pickPhoto(source: 'camera' | 'library', width = 1000): Promise<string | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  return persistImage(res.assets[0].uri, 'photos', width);
}
