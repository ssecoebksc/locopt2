
export enum ScheduleType {
  IA = 'IA',
  IB = 'IB',
  IC = 'IC',
  Unscheduled = 'Unscheduled',
  TI = 'TI',
  TOH = 'TOH',
  IOH = 'IOH',
  POH = 'POH'
}

export enum PantographType {
  PT1 = 'PT1',
  PT2 = 'PT2'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  TECHNICIAN = 'TECHNICIAN',
  SUPERVISOR = 'SUPERVISOR',
  OFFICER = 'OFFICER'
}

export interface User {
  id: string;
  password?: string;
  role: UserRole;
  displayName: string;
  hrmsId: string; // 6 character caps
}

export interface LocoRecord {
  id: string;
  locoNumber: string;
  baseShed: string;
  schedule: ScheduleType;
  pantograph: PantographType;
  image?: string; // base64
  createdAt: string; // ISO string
  formattedDate: string; // DD/MM/YYYY
  formattedTime: string; // HH:mm
  createdBy: string; // Display Name (HRMS ID)
  syncStatus?: 'pending' | 'synced' | 'uploading' | 'failed'; // Tracks if data reached the 'one place'
  uploadProgress?: number; // 0-100
}
