
export interface Verse {
  id: number;
  text: string;
  translation: string;
}

export interface StudentProfile {
  fullName: string;
  icNumber: string;
  className: string;
}

export interface TasmikResult {
  verseId: number;
  isCorrect: boolean;
  score: number;
  transcription: string;
  feedback: string;
}

export interface HistoryRecord {
  id: string;
  verseId: number;
  verseText: string;
  score: number;
  isCorrect: boolean;
  timestamp: number;
}

export enum AppState {
  ONBOARDING = 'ONBOARDING',
  DASHBOARD = 'DASHBOARD',
  STUDY = 'STUDY',
  TASMIK_TEST = 'TASMIK_TEST',
  PROCESSING = 'PROCESSING',
  RESULTS = 'RESULTS',
  REPORT = 'REPORT'
}
