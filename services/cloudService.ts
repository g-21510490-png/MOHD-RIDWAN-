
import { HistoryRecord, StudentProfile } from '../types';

// Simulasi pangkalan data "Cloud" yang boleh diakses merentas sesi
const CLOUD_DB_KEY = 'etasmik_shared_global_db';

export const syncDataToCloud = (profile: StudentProfile, history: HistoryRecord[]) => {
  try {
    const cloudDb = JSON.parse(localStorage.getItem(CLOUD_DB_KEY) || '{}');
    cloudDb[profile.icNumber.trim()] = {
      profile,
      history: history || [],
      lastSync: Date.now()
    };
    localStorage.setItem(CLOUD_DB_KEY, JSON.stringify(cloudDb));
    console.log("SINKRONISASI CLOUD BERJAYA:", profile.icNumber);
  } catch (e) {
    console.error("Gagal sinkron ke Cloud:", e);
  }
};

export const fetchAllStudentsFromCloud = () => {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_DB_KEY) || '{}');
  } catch (e) {
    return {};
  }
};

export const fetchStudentByIc = (icNumber: string) => {
  const db = fetchAllStudentsFromCloud();
  const student = db[icNumber.trim()];
  if (student) {
    console.log("DATA DITEMUI DALAM CLOUD:", student.profile.fullName);
    return student;
  }
  return null;
};
