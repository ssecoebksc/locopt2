
import { User, LocoRecord, UserRole } from '../types';
import { optimizeBase64Image, isValidImageData } from './imageOptimizer';

const DB_NAME = 'LocoTrackDB';
const DB_VERSION = 4;
const STORES = {
  USERS: 'users',
  RECORDS: 'records',
  SETTINGS: 'settings'
};

const DEFAULT_HUB_URL = 'https://desktop-0qgtc3v.tailbf0dbf.ts.net/';
const BASE64_CHUNK_SIZE = 524288; // 512KB base64 slice (~384KB binary) for fast transfer
const MAX_RETRIES = 3;
const FETCH_TIMEOUT = 15000;
const UPLOAD_TIMEOUT = 25000; // 25 seconds per chunk (fast failure & recovery)

class Database {
  private db: IDBDatabase | null = null;
  private isSyncingInProgress = false;
  private activeUploads = new Set<string>();

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.ensureDefaultAdmin()
          .then(() => this.cleanupStaleUploads())
          .then(resolve);
      };
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.USERS)) db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.RECORDS)) db.createObjectStore(STORES.RECORDS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      };
    });
  }

  private async cleanupStaleUploads(): Promise<void> {
    try {
      const records = await this.getRecords();
      for (const rec of records) {
        // Any record left in 'uploading' when the app initializes was interrupted
        if (rec.syncStatus === 'uploading') {
          rec.syncStatus = 'pending';
          rec.uploadProgress = 0;
          await this.saveRecordToStoreDirectly(rec);
        }
      }
    } catch (e) {
      console.warn('Failed to cleanup stale uploads', e);
    }
  }

  private async ensureDefaultAdmin(): Promise<void> {
    const users = await this.getUsers();
    if (!users.find(u => u.hrmsId === 'ADMIN1')) {
      await this.saveUser({
        id: 'admin-1',
        password: 'password',
        role: UserRole.ADMIN,
        displayName: 'System Administrator',
        hrmsId: 'ADMIN1'
      });
    }
  }

  async resetAdminAccount(): Promise<void> {
    const users = await this.getUsers();
    const admin = users.find(u => u.hrmsId === 'ADMIN1');
    if (admin) {
      admin.password = 'password';
      await this.saveUser(admin);
    }
  }

  private getStore(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error("Database not initialized");
    return this.db.transaction(name, mode).objectStore(name);
  }

  async getServerUrl(): Promise<string> {
    return this.getSetting('serverUrl', DEFAULT_HUB_URL);
  }

  async setServerUrl(url: string): Promise<void> {
    await this.setSetting('serverUrl', url);
  }

  private async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    return new Promise((resolve) => {
      try {
        const store = this.getStore(STORES.SETTINGS);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value || defaultValue);
        request.onerror = () => resolve(defaultValue);
      } catch { resolve(defaultValue); }
    });
  }

  private async setSetting(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.SETTINGS, 'readwrite');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getRecords(): Promise<LocoRecord[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.RECORDS);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result as LocoRecord[];
        resolve(results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingRecords(): Promise<LocoRecord[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.RECORDS);
      const request = store.openCursor();
      const results: LocoRecord[] = [];
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value as LocoRecord;
          if (record.syncStatus !== 'synced') results.push(record);
          cursor.continue();
        } else resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async cancelUpload(recordId: string): Promise<void> {
    this.activeUploads.delete(recordId);
    const records = await this.getRecords();
    const record = records.find(r => r.id === recordId);
    if (record && record.syncStatus !== 'synced') {
      record.syncStatus = 'failed';
      record.uploadProgress = 0;
      await this.saveRecordToStoreDirectly(record);
    }
  }

  async saveRecord(record: LocoRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.RECORDS, 'readwrite');
      const request = store.put(record);
      request.onsuccess = () => {
        // Asynchronously push record directly in foreground
        this.pushRecord(record).catch(err => {
          console.warn('Foreground record push error:', err);
        });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRecord(recordId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const store = this.getStore(STORES.RECORDS, 'readwrite');
      const request = store.delete(recordId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    const rawUrl = await this.getServerUrl();
    if (rawUrl) {
      const baseUrl = this.cleanUrl(rawUrl);
      try {
        await this.fetchWithTimeout(`${baseUrl}/api/records/${recordId}`, { method: 'DELETE', mode: 'cors' }, 5000);
      } catch (e) { console.warn('Remote delete offline', e); }
    }
  }

  async getUsers(): Promise<User[]> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.USERS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveUser(user: User): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.USERS, 'readwrite');
      const request = store.put(user);
      request.onsuccess = () => {
        this.pushUser(user);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteUser(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.USERS, 'readwrite');
      const request = store.delete(userId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private cleanUrl(url: string): string {
    let clean = url.trim();
    if (clean.includes('.ts.net')) {
      if (clean.startsWith('http://')) clean = clean.replace('http://', 'https://');
      else if (!clean.startsWith('https://')) clean = `https://${clean}`;
    } else if (!clean.startsWith('http')) clean = `http://${clean}`;
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
  }

  async testServer(url: string): Promise<boolean> {
    const res = await this.testConnection(url);
    return res.success;
  }

  async testConnection(url: string): Promise<{ success: boolean; message: string; code?: string }> {
    try {
      const target = this.cleanUrl(url);
      const response = await this.fetchWithTimeout(`${target}/`, { mode: 'cors', headers: { 'Accept': 'application/json' } }, 8000);
      if (response.ok) {
        const data = await response.json();
        return data.ready ? { success: true, message: "Hub Linked Successfully." } : { success: false, message: "Hub is initializing.", code: 'BUSY' };
      }
      return { success: false, message: `Server error ${response.status}`, code: 'HTTP_ERR' };
    } catch (err: any) {
      if (err.name === 'AbortError') return { success: false, message: "Timeout. Check Tailscale.", code: 'TIMEOUT' };
      return { success: false, message: "Unreachable Hub.", code: 'OFFLINE' };
    }
  }

  private async uploadDirect(recordId: string, base64Data: string, baseUrl: string): Promise<string | null> {
    try {
      const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const cleanBase64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, '');
      if (cleanBase64.length < 100) return null;

      const res = await this.fetchWithTimeout(`${baseUrl}/api/upload/direct`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, data: cleanBase64 })
      }, UPLOAD_TIMEOUT);

      if (res.ok) {
        const data = await res.json();
        return data.imageUrl || null;
      }

      // If server rejected because data was corrupt (422), do not proceed with fallback to chunking
      if (res.status === 422) {
        const errJson = await res.json().catch(() => ({}));
        console.error(`[Upload Direct Rejected] Corrupt image for record ${recordId}:`, errJson);
        return null;
      }
    } catch (e) {
      console.warn('Direct upload fallback to chunking:', e);
    }
    return null;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }

  private async uploadInChunks(recordId: string, base64Data: string, baseUrl: string, onProgress?: (progress: number) => void): Promise<string | null> {
    try {
      const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      // Sanitize base64 string to prevent alignment/bitshift corruption across chunk boundaries
      const cleanBase64 = rawBase64.replace(/[^A-Za-z0-9+/=]/g, '');
      const totalLen = cleanBase64.length;
      if (totalLen < 100) {
        console.error('Base64 image data too short or invalid');
        return null;
      }

      // Ensure chunk size is strictly divisible by 4 so each chunk decodes cleanly without bit shifting
      const CHUNK_SIZE = Math.floor(BASE64_CHUNK_SIZE / 4) * 4;
      const totalChunks = Math.ceil(totalLen / CHUNK_SIZE);
      
      for (let i = 0; i < totalChunks; i++) {
        // Check if upload was cancelled by user
        if (!this.activeUploads.has(recordId)) {
          throw new Error('Upload cancelled');
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalLen);
        const chunkData = cleanBase64.substring(start, end);
        
        let success = false;
        let retries = 0;
        
        while (!success && retries < MAX_RETRIES) {
          if (!this.activeUploads.has(recordId)) throw new Error('Upload cancelled');
          try {
            const res = await this.fetchWithTimeout(`${baseUrl}/api/upload/chunk`, { 
              method: 'POST', 
              mode: 'cors', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ recordId, chunkIndex: i, totalChunks, data: chunkData }) 
            }, UPLOAD_TIMEOUT);
            
            if (res.ok) {
              success = true;
            } else {
              retries++;
              if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 600 * retries));
            }
          } catch (e) {
            retries++;
            if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 600 * retries));
          }
        }
        
        if (!success) throw new Error(`Chunk ${i + 1}/${totalChunks} failed after ${MAX_RETRIES} attempts`);
        
        if (onProgress) {
          const progress = Math.min(95, Math.round(((i + 1) / totalChunks) * 90));
          onProgress(progress);
        }
      }
      
      if (!this.activeUploads.has(recordId)) throw new Error('Upload cancelled');

      // Send totalChunks so server can strictly verify 100% chunk completeness before assembly
      const assembleRes = await this.fetchWithTimeout(`${baseUrl}/api/upload/assemble`, { 
        method: 'POST', 
        mode: 'cors', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ recordId, totalChunks }) 
      }, UPLOAD_TIMEOUT);
      
      if (assembleRes.ok) {
        const data = await assembleRes.json();
        if (onProgress) onProgress(100);
        return data.imageUrl;
      } else {
        const errData = await assembleRes.json().catch(() => ({}));
        console.error(`[Assemble Failed] Record ${recordId}:`, errData);
      }
    } catch (e) { 
      console.error('Chunked upload failed', e); 
    }
    return null;
  }

  async sendHeartbeat(userId: string): Promise<void> {
    const rawUrl = await this.getServerUrl();
    if (!rawUrl) return;
    const baseUrl = this.cleanUrl(rawUrl);
    try {
      await this.fetchWithTimeout(`${baseUrl}/api/users/${userId}/heartbeat`, { method: 'POST', mode: 'cors' }, 5000);
    } catch (e) { console.warn('Heartbeat failed', e); }
  }

  async pushRecord(record: LocoRecord): Promise<boolean> {
    if (record.syncStatus === 'synced') return false;
    if (this.activeUploads.has(record.id)) return false;
    
    const rawUrl = await this.getServerUrl();
    if (!rawUrl) return false;
    const baseUrl = this.cleanUrl(rawUrl);

    this.activeUploads.add(record.id);
    record.syncStatus = 'uploading';
    record.uploadProgress = 0;
    await this.saveRecordToStoreDirectly(record);

    try {
      let imageUrl = null;
      if (record.image && record.image.startsWith('data:image')) {
        // Pre-validate image before attempting upload
        if (!isValidImageData(record.image)) {
          console.error(`Record ${record.id} image data failed pre-upload validation`);
          record.syncStatus = 'failed';
          record.uploadProgress = 0;
          await this.saveRecordToStoreDirectly(record);
          return false;
        }

        // 1. Optimize image in case it was stored with high resolution
        try {
          record.image = await optimizeBase64Image(record.image);
        } catch (optErr) {
          console.warn('Image optimization skipped:', optErr);
        }

        // 2. Try superfast single-request direct upload first
        imageUrl = await this.uploadDirect(record.id, record.image, baseUrl);

        // 3. Fallback to chunked upload if direct upload is not supported or failed
        if (!imageUrl) {
          if (!this.activeUploads.has(record.id)) return false;
          imageUrl = await this.uploadInChunks(record.id, record.image, baseUrl, async (progress) => {
            record.uploadProgress = progress;
          });
        }

        if (!imageUrl) {
          record.syncStatus = 'failed';
          record.uploadProgress = 0;
          await this.saveRecordToStoreDirectly(record);
          return false;
        }
      } else {
        imageUrl = record.image;
      }

      if (!this.activeUploads.has(record.id)) return false;

      record.uploadProgress = 95;
      const response = await this.fetchWithTimeout(`${baseUrl}/api/records`, { 
        method: 'POST', 
        mode: 'cors', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ ...record, image: imageUrl }) 
      }, FETCH_TIMEOUT);
      
      if (response.ok) {
        record.syncStatus = 'synced';
        record.uploadProgress = 100;
        record.image = imageUrl || record.image;
        await this.saveRecordToStoreDirectly(record);
        return true;
      } else {
        record.syncStatus = 'failed';
        record.uploadProgress = 0;
        await this.saveRecordToStoreDirectly(record);
      }
    } catch (e) { 
      console.warn('Record push failed', e); 
      record.syncStatus = 'failed';
      record.uploadProgress = 0;
      await this.saveRecordToStoreDirectly(record);
    } finally {
      this.activeUploads.delete(record.id);
    }
    return false;
  }

  async pushUser(user: User): Promise<boolean> {
    const rawUrl = await this.getServerUrl();
    if (!rawUrl) return false;
    const baseUrl = this.cleanUrl(rawUrl);
    try {
      const response = await this.fetchWithTimeout(`${baseUrl}/api/users`, { 
        method: 'POST', 
        mode: 'cors', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(user) 
      });
      return response.ok;
    } catch (e) { console.warn('User push failed', e); }
    return false;
  }

  async syncUsers(): Promise<{ pushed: number, pulled: number, error?: string }> {
    const rawUrl = await this.getServerUrl();
    if (!rawUrl) return { pushed: 0, pulled: 0 };
    const baseUrl = this.cleanUrl(rawUrl);
    let pushed = 0, pulled = 0;
    try {
      const lastSync = await this.getSetting('lastUserSync', '');
      const userRes = await this.fetchWithTimeout(`${baseUrl}/api/users${lastSync ? `?since=${encodeURIComponent(lastSync)}` : ''}`, { mode: 'cors' });
      if (userRes.ok) {
        const serverUsers = await userRes.json();
        let maxUpdatedAt = lastSync;
        for (const sUser of serverUsers) {
          await this.saveUserToStoreDirectly(sUser);
          if (!maxUpdatedAt || new Date(sUser.updatedAt) > new Date(maxUpdatedAt)) maxUpdatedAt = sUser.updatedAt;
          pulled++;
        }
        if (maxUpdatedAt) await this.setSetting('lastUserSync', maxUpdatedAt);
      }
    } catch (e: any) { return { pushed, pulled, error: e.message }; }
    return { pushed, pulled };
  }

  async syncRecords(): Promise<{ pushed: number, pulled: number, error?: string }> {
    const rawUrl = await this.getServerUrl();
    if (!rawUrl) return { pushed: 0, pulled: 0 };
    const baseUrl = this.cleanUrl(rawUrl);
    let pushed = 0, pulled = 0;
    try {
      const lastSync = await this.getSetting('lastRecordSync', '');
      const recordsRes = await this.fetchWithTimeout(`${baseUrl}/api/records${lastSync ? `?since=${encodeURIComponent(lastSync)}` : ''}`, { mode: 'cors' });
      if (recordsRes.ok) {
        const serverRecords = await recordsRes.json();
        let maxUpdatedAt = lastSync;
        for (const sRecord of serverRecords) {
          sRecord.syncStatus = 'synced';
          if (sRecord.image && sRecord.image.startsWith('/storage/')) sRecord.image = `${baseUrl}/api/view-image?path=${sRecord.image}`;
          await this.saveRecordToStoreDirectly(sRecord);
          if (!maxUpdatedAt || new Date(sRecord.serverUpdatedAt) > new Date(maxUpdatedAt)) maxUpdatedAt = sRecord.serverUpdatedAt;
          pulled++;
        }
        if (maxUpdatedAt) await this.setSetting('lastRecordSync', maxUpdatedAt);
      }
      const pending = await this.getPendingRecords();
      for (const record of pending) {
        // Skip if currently actively uploading in this session
        if (this.activeUploads.has(record.id)) continue;
        
        // Check connection before each record push to avoid hanging in a loop if offline
        const isOnline = await this.testServer(baseUrl);
        if (!isOnline) break;
        if (await this.pushRecord(record)) pushed++;
      }
    } catch (e: any) { return { pushed, pulled, error: e.message }; }
    return { pushed, pulled };
  }

  async getRecordById(id: string): Promise<LocoRecord | null> {
    return new Promise((resolve) => {
      try {
        const store = this.getStore(STORES.RECORDS);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }

  async syncWithServer(): Promise<{ pushed: number, pulled: number, error?: string }> {
    if (this.isSyncingInProgress) return { pushed: 0, pulled: 0 };
    this.isSyncingInProgress = true;
    try {
      const userRes = await this.syncUsers();
      const recordRes = await this.syncRecords();
      return { pushed: userRes.pushed + recordRes.pushed, pulled: userRes.pulled + recordRes.pulled, error: userRes.error || recordRes.error };
    } finally {
      this.isSyncingInProgress = false;
    }
  }

  private async saveRecordToStoreDirectly(record: LocoRecord): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.RECORDS, 'readwrite');
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async saveUserToStoreDirectly(user: User): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORES.USERS, 'readwrite');
      const request = store.put(user);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new Database();
export const initDb = async () => await db.init();
