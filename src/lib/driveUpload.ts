import { supabase } from './supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Supabase wraps a non-2xx edge function response in a generic error; the
// actual message the function returned lives in its response body.
async function extractInvokeError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return new Error(body?.error ?? (error as Error).message);
    } catch {
      // response body wasn't JSON — fall through to the generic message
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

// Task attachments upload straight from the browser to Google Drive via its
// resumable upload protocol, instead of relaying the file through the edge
// function as base64 — that relay approach crashes the function's isolate
// (out of memory) on anything much larger than a few MB, since it has to
// hold the base64 string, the decoded bytes, AND a re-encoded multipart body
// all at once. The resumable session URL Google returns is a one-time
// capability grant — no OAuth token needs to reach the browser for the PUT.
async function uploadFileToDriveResumable(file: File, type: string, meta: Record<string, string>): Promise<string> {
  const { data: initData, error: initError } = await supabase.functions.invoke('upload-to-drive', {
    body: { mode: 'init', filename: file.name, mimeType: file.type || 'application/octet-stream', type, meta },
  });
  if (initError) throw await extractInvokeError(initError);
  if (!initData?.success || !initData?.uploadUrl) {
    throw new Error(initData?.error ?? 'Failed to start upload.');
  }

  const putRes = await fetch(initData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload to Google Drive failed (${putRes.status}).`);
  }
  const driveFile = await putRes.json();

  const { data: finalizeData, error: finalizeError } = await supabase.functions.invoke('upload-to-drive', {
    body: { mode: 'finalize', fileId: driveFile.id, type },
  });
  if (finalizeError) throw await extractInvokeError(finalizeError);
  if (!finalizeData?.success) {
    throw new Error(finalizeData?.error ?? 'Failed to finalize upload.');
  }

  return finalizeData.url as string;
}

export async function uploadFileToDrive(
  file: File,
  type: string,
  meta: Record<string, string> = {},
): Promise<string | null> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (max 100 MB). This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
  }

  if (type === 'task_attachment') {
    return uploadFileToDriveResumable(file, type, meta);
  }

  const buffer = await file.arrayBuffer();
  const base64Content = toBase64(buffer);

  const { data, error } = await supabase.functions.invoke('upload-to-drive', {
    body: { filename: file.name, mimeType: file.type || 'application/octet-stream', base64Content, type, meta },
  });

  if (error) throw await extractInvokeError(error);

  if (!data?.success) {
    throw new Error(data?.error ?? 'Upload failed');
  }

  return data.url as string;
}
