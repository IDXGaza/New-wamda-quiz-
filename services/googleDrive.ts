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
      let friendlyMsg = '';
      const errorCode = err?.code || '';
      const errorMsg = err?.message || '';
      
      if (errorCode === 'auth/cancelled-popup-request' || errorMsg.includes('cancelled-popup-request')) {
        friendlyMsg = 'تم إلغاء طلب تسجيل الدخول بسبب تداخل مع نافذة أخرى أو إغلاقها (يرجى المحاولة مجدداً).';
      } else if (errorCode === 'auth/popup-closed-by-user' || errorMsg.includes('popup-closed-by-user')) {
        friendlyMsg = 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
      } else if (errorCode === 'auth/popup-blocked' || errorMsg.includes('popup-blocked')) {
        friendlyMsg = 'تم حظر نافذة تسجيل الدخول المنبثقة من قبل متصفحك. يرجى السماح بالنوافذ المنبثقة وحاول مجدداً.';
      } else {
        friendlyMsg = errorMsg || errorCode || 'خطأ غير معروف في المصادقة.';
      }
      throw new Error(`فشل تسجيل الدخول بالويب: ${friendlyMsg}`);
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

// --- New individual file helpers for auto-sync ---

/**
 * Calculates SHA-256 hash of a Blob for deduplication.
 */
export const getBlobSHA256 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Uploads a file to appDataFolder and returns the metadata including ID.
 */
export const uploadFileToDrive = async (
  filename: string,
  mimeType: string,
  blob: Blob,
  accessToken: string
): Promise<{ id: string }> => {
  const metadata = {
    name: filename,
    parents: ['appDataFolder']
  };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const boundary = 'traneem_boundary_unique_998';
  
  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataBlob,
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipartBody
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`فشل الرفع ${filename}: ${response.statusText} (${errText})`);
  }
  return response.json();
};

/**
 * Updates an existing file content in Drive.
 */
export const updateFileInDrive = async (
  fileId: string,
  blob: Blob,
  accessToken: string
): Promise<any> => {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': blob.type || 'application/octet-stream'
    },
    body: blob
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`فشل تحديث الملف ${fileId}: ${response.statusText} (${errText})`);
  }
  return response.json();
};

/**
 * Downloads file as Blob.
 */
export const downloadFileFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`فشل تحميل الملف ${fileId}: ${response.statusText}`);
  }
  return response.blob();
};

/**
 * Downloads file and parses as JSON.
 */
export const downloadJSONFromDrive = async (fileId: string, accessToken: string): Promise<any> => {
  const blob = await downloadFileFromDrive(fileId, accessToken);
  const text = await blob.text();
  return JSON.parse(text);
};

/**
 * Finds a file by exact name in appDataFolder, returning file ID if found.
 */
export const findFileInDrive = async (filename: string, accessToken: string): Promise<string | null> => {
  const q = encodeURIComponent(`name = '${filename}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`فشل البحث عن الملف ${filename}: ${response.statusText}`);
  }
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
};

/**
 * Deletes a file from Drive by ID.
 */
export const deleteFileFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`فشل حذف الملف ${fileId}: ${response.statusText}`);
  }
};

