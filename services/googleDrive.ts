import { signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { auth } from '../firebase';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
}

export const signInToDrive = async (): Promise<{ user: User; accessToken: string }> => {
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: 'consent select_account' });
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('لم يتم العثور على رمز الوصول.');
  }
  return { user: result.user, accessToken: credential.accessToken };
};

export const uploadBackupToDrive = async (zipBlob: Blob, accessToken: string): Promise<any> => {
  const timestamp = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
  const filename = `traneem_backup_${timestamp}.zip`;
  const metadata = { name: filename, mimeType: 'application/zip' };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const boundary = 'traneem_backup_boundary_998877';
  const multipartBody = new Blob([
    `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataBlob,
    `\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    zipBlob,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipartBody
  });
  if (!response.ok) throw new Error(`فشل الرفع: ${response.statusText}`);
  return await response.json();
};

export const listBackupsInDrive = async (accessToken: string): Promise<DriveBackupFile[]> => {
  const q = encodeURIComponent("name contains 'traneem_backup_' and mimeType = 'application/zip' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime+desc&fields=files(id,name,size,createdTime)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    if (response.status === 401) throw new Error('ExpiredToken');
    throw new Error(`فشل جلب الملفات: ${response.statusText}`);
  }
  const data = await response.json();
  return data.files || [];
};

export const downloadBackupFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`فشل التحميل: ${response.statusText}`);
  return await response.blob();
};

export const deleteBackupFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`فشل الحذف: ${response.statusText}`);
};
