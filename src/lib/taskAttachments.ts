import { supabase } from './supabase';
import { uploadFileToDrive } from './driveUpload';

interface CreateTaskAttachmentParams {
  taskId: number;
  file: File;
  uploadedBy: string;
  projectId: number;
  projectName?: string;
}

export async function createTaskAttachment({
  taskId,
  file,
  uploadedBy,
  projectId,
  projectName = 'General',
}: CreateTaskAttachmentParams) {
  const url = await uploadFileToDrive(file, 'task_attachment', { project_id: String(projectId), project_name: projectName });
  if (!url) return null;

  const { data, error } = await supabase
    .from('hub_project_task_attachments')
    .insert({
      task_id: taskId,
      uploaded_by: uploadedBy,
      name: file.name,
      url,
      size: file.size,
      mime_type: file.type,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
