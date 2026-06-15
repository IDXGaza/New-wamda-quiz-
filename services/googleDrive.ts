import { Capacitor } from '@capacitor/core';

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
}

// Modern Web Authentication with Firebase Auth
export const getAccessToken = async (): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      await GoogleAuth.initialize();
      const user = await GoogleAuth.signIn();
      const accessToken = user?.authentication?.accessToken;
      if (!accessToken) throw new Error('accessToken فارغ');
      return accessToken;
    } catch (err: any) {
      const msg = err?.message || err?.code || JSON.stringify(err) || 'خطأ غير معروف';
      throw new Error(msg);
    }
  } else {
    try {
      const { auth } = await import('../firebase');
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      
      if (!accessToken) {
        throw new Error('فشل الحصول على رمز الوصول من قوقل (Access Token). تأكد من إعداد نطاقات الوصول (Scopes).');
      }
      return accessToken;
    } catch (err: any) {
      const msg = err?.message || err?.code || JSON.stringify(err) || 'خطأ غير معروف';
      throw new Error(`فشل تسجيل الدخول بالويب: ${msg}`);
    }
  }
};

export const uploadBackupToDrive = async (zipBlob: Blob, accessToken: string, customFilename?: string): Promise<any> => {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
  const filename = customFilename || `نسخة_احتياطية_ترانيم_${datePart}_${timePart}.zip`;
  
  // Use multipart/related for appDataFolder
  const metadata = { 
    name: filename, 
    mimeType: 'application/zip', 
    parents: ['appDataFolder'] 
  };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const boundary = 'traneem_backup_boundary_998877';
  
  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
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
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Google Drive Upload Error:', errorData);
    throw new Error(`فشل الرفع: ${response.statusText} (${errorData?.error?.message || 'خطأ غير معروف'})`);
  }
  return await response.json();
};

export const updateBackupInDrive = async (fileId: string, zipBlob: Blob, accessToken: string): Promise<any> => {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip'
    },
    body: zipBlob
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Google Drive Update Error:', errorData);
    throw new Error(`فشل التحديث: ${response.statusText} (${errorData?.error?.message || 'خطأ غير معروف'})`);
  }
  return await response.json();
};

export const listBackupsInDrive = async (accessToken: string): Promise<DriveBackupFile[]> => {
  const q = encodeURIComponent("(name contains 'traneem_backup' or name contains 'ترانيم') and mimeType = 'application/zip' and trashed = false");
  // Use spaces=appDataFolder
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&orderBy=createdTime+desc&fields=files(id,name,size,createdTime)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    if (response.status === 401) throw new Error('ExpiredToken');
    const errorData = await response.json().catch(() => ({}));
    console.error('Google Drive List Error:', errorData);
    throw new Error(`فشل جلب الملفات: ${response.statusText} (${errorData?.error?.message || 'خطأ غير معروف'})`);
  }
  const data = await response.json();
  return data.files || [];
};

export const downloadBackupFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Google Drive Download Error:', errorData);
    throw new Error(`فشل التحميل: ${response.statusText} (${errorData?.error?.message || 'خطأ غير معروف'})`);
  }
  return await response.blob();
};

export const deleteBackupFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Google Drive Delete Error:', errorData);
    throw new Error(`فشل الحذف: ${response.statusText} (${errorData?.error?.message || 'خطأ غير معروف'})`);
  }
};
