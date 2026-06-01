import { Capacitor } from '@capacitor/core';

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
}

// Modern Web Authentication placeholder
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
    // For Web, assume an existing implementation or hook into GIS
    throw new Error('الويب غير مدعوم حالياً في هذه الخدمة');
  }
};

export const uploadBackupToDrive = async (zipBlob: Blob, accessToken: string): Promise<any> => {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
  const filename = `نسخة_احتياطية_ترانيم_${datePart}_${timePart}.zip`;
  
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
  if (!response.ok) throw new Error(`فشل الرفع: ${response.statusText}`);
  return await response.json();
};

export const listBackupsInDrive = async (accessToken: string): Promise<DriveBackupFile[]> => {
  const q = encodeURIComponent("(name contains 'traneem_backup_' or name contains 'نسخة_احتياطية_ترانيم_') and mimeType = 'application/zip' and trashed = false");
  // Use spaces=appDataFolder
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&orderBy=createdTime+desc&fields=files(id,name,size,createdTime)`;
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
