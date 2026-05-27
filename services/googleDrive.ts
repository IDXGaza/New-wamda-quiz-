import { signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { auth } from '../firebase';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
}

/**
 * Trigger Google Sign-In with Google Drive scopes using redirect (works in APK)
 */
export const signInToDrive = async (): Promise<void> => {
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent select_account'
  });
  await signInWithRedirect(auth, provider);
};

/**
 * After redirect returns, get the user and access token
 */
export const getRedirectDriveResult = async (): Promise<{ user: User; accessToken: string } | null> => {
  const result = await getRedirectResult(auth);
  if (!result) return null;

  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential || !credential.accessToken) {
    throw new Error('لم يتم العثور على رمز الوصول إلى Google Drive. يرجى المحاولة مرة أخرى.');
  }

  return {
    user: result.user,
    accessToken: credential.accessToken
  };
};

/**
 * Upload a backup zip blob to Google Drive
 */
export const uploadBackupToDrive = async (zipBlob: Blob, accessToken: string): Promise<any> => {
  const timestamp = new Date().toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '-');
  const filename = `traneem_backup_${timestamp}.zip`;

  const metadata = {
    name: filename,
    mimeType: 'application/zip',
    description: 'نسخة احتياطية لتطبيق ترانيم Traneem App Backup'
  };

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
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: multipartBody
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Google Drive Upload Failed:', errText);
    throw new Error(`فشل الرفع لمشغل قوقل درايف: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * List backup zip files in Google Drive
 */
export const listBackupsInDrive = async (accessToken: string): Promise<DriveBackupFile[]> => {
  const q = encodeURIComponent("name contains 'traneem_backup_' and mimeType = 'application/zip' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime+desc&fields=files(id,name,size,createdTime)`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('ExpiredToken');
    }
    const errText = await response.text();
    console.error('Google Drive List Failed:', errText);
    throw new Error(`فشل جلب الملفات من قوقل درايف: ${response.statusText}`);
  }

  const data = await response.json();
  return data.files || [];
};

/**
 * Download a backup zip from Google Drive as a Blob
 */
export const downloadBackupFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Google Drive Download Failed:', errText);
    throw new Error(`فشل تحميل الملف من قوقل درايف: ${response.statusText}`);
  }

  return await response.blob();
};

/**
 * Delete a file in Google Drive
 */
export const deleteBackupFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Google Drive Delete Failed:', errText);
    throw new Error(`فشل حذف الملف من قوقل درايف: ${response.statusText}`);
  }
};
