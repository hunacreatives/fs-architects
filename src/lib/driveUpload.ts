import { supabase } from './supabase';

export async function uploadFileToDrive(
  file: File,
  type: string,
  meta: Record<string, string> = {},
): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64Content = btoa(binary);

  const { data, error } = await supabase.functions.invoke('upload-to-drive', {
    body: { filename: file.name, mimeType: file.type || 'application/octet-stream', base64Content, type, meta },
  });

  if (error || !data?.success) {
    console.error('Drive upload failed:', error ?? data?.error);
    return null;
  }
  return data.url as string;
}
