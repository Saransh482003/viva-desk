'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Video,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Columns,
  ShieldCheck,
  Send,
  Sliders,
  Calendar as CalendarIcon,
  Plus,
  UserCheck,
  Radio,
  Award,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Unlock,
  Layers,
  Keyboard,
  BarChart3,
  LayoutDashboard,
  Lightbulb,
  MessageSquareText,
  Coffee,
  Flame,
  TrendingUp,
  Filter
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  Cell
} from 'recharts';

export type UserRole = 'INSTRUCTOR' | 'EXAMINER' | 'STUDENT';
export type VivaLevel = 'L1' | 'L2';
export type PageRoute = 'cockpit' | 'calendar' | 'statistics' | 'command' | 'portal';

export type LifecycleState =
  | 'ELIGIBLE_L1'
  | 'BOOKED_L1'
  | 'AWAITING_IITM_FEE_CLEARANCE'
  | 'ELIGIBLE_L2'
  | 'BOOKED_L2'
  | 'PROJECT_PASSED'
  | 'PROJECT_FAILED_D'
  | 'PROJECT_FAILED_E';

export interface Persona {
  id: number;
  full_name: string;
  institute_email: string;
  role: UserRole;
  examiner_level?: VivaLevel | null;
  roll_number?: string | null;
  notebook_gdrive_url?: string | null;
  project_repo_url?: string | null;
  lifecycle_state?: LifecycleState | null;
  pending_reattempt_level?: VivaLevel | null;
  final_project_grade?: string | null;
}

export interface RubricQuestion {
  question_id: number;
  display_order: number;
  prompt: string;
  max_marks: number;
  weight_pct: number;
}

export interface RubricVersion {
  rubric_version_id: number;
  cycle_id: number;
  level: VivaLevel;
  version_number: number;
  title: string;
  pass_percentage: number;
  is_active: boolean;
  questions: RubricQuestion[];
}

export interface QuestionScore {
  question_id: number;
  raw_marks: number;
  comment?: string;
}

export interface EvaluationRecord {
  evaluation_id: number;
  booking_id: number;
  rubric_version_id: number;
  rubric_version_number: number;
  examiner_email: string;
  pre_approved_score: number;
  recommended_outcome: 'PASS' | 'FAIL';
  examiner_overall_remarks: string;
  is_approved: boolean;
  approved_score?: number | null;
  final_outcome?: 'PASS' | 'FAIL' | null;
  assigned_letter_grade?: 'D' | 'E' | null;
  completed_date?: string;
  scores: QuestionScore[];
}

export interface SlotRecord {
  id: number;
  cycle_id: number;
  examiner_id: number;
  examiner_name: string;
  examiner_email: string;
  level: VivaLevel;
  start_time: string;
  end_time: string;
  status: 'OPEN' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';
  meet_join_url?: string | null;
  examiner_cohost_granted: boolean;
  student_joined: boolean;
  examiner_joined: boolean;
  recording_active: boolean;
  conference_ended: boolean;
  recording_drive_url?: string | null;
  booking?: {
    booking_id: number;
    student_id: number;
    student_name: string;
    student_email: string;
    roll_number: string;
    notebook_gdrive_url?: string | null;
    project_repo_url?: string | null;
    attempt_number: number;
    status: 'BOOKED' | 'COMPLETED' | 'RESCHEDULE_REQUESTED';
    reschedule_reason?: string;
  } | null;
}

export interface AuditEntry {
  id: number;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: number;
  summary: string;
  created_at: string;
}

interface HistoricalDaySummary {
  dateKey: string;
  taken: number;
  passed: number;
  avgScore: number;
  hourlyBuckets: number[]; // [9-12, 12-15, 15-18, 18-21]
}

const SCORE_PILLS = [0, 2, 4, 5, 6, 7, 8, 9, 10];

const QUICK_REMARK_CHIPS = [
  'Clean leakage-free EDA',
  'Strong code ownership',
  'Verified live notebook tweak',
  'Clear metric rationale',
  'Needs stronger regularization intuition',
  'Struggled to trace preprocessing'
];

const PROBE_BANK: Record<VivaLevel, { topic: string; question: string; lookFor: string }[]> = {
  L1: [
    {
      topic: 'Data Leakage Check',
      question: 'Show the exact cell where StandardScaler or SimpleImputer is fitted. Was it fit before or after train_test_split?',
      lookFor: 'Must call fit_transform on X_train only and transform on X_val / X_test.'
    },
    {
      topic: 'Metric Justification',
      question: 'Why did you optimize Macro-F1 / ROC-AUC here instead of raw accuracy given your class distribution?',
      lookFor: 'Clear awareness of minority class imbalance and false-negative cost.'
    },
    {
      topic: 'Live Ownership Tweak',
      question: 'Add max_depth=4 (or change C=0.1) in your notebook right now and predict how train vs validation error will move.',
      lookFor: 'Navigates their own notebook effortlessly and predicts higher bias / lower variance.'
    },
    {
      topic: 'Feature Importance',
      question: 'If we drop your top-ranked feature, which remaining feature absorbs its signal and why?',
      lookFor: 'Understands collinearity and domain meaning of engineered columns.'
    }
  ],
  L2: [
    {
      topic: 'Gradient & Loss Mechanics',
      question: 'How does L1 vs L2 penalty alter the loss surface geometry near zero weights?',
      lookFor: 'Diamond vs circular constraint contours; subgradient sparsity at axes.'
    },
    {
      topic: 'Error Slice Diagnostics',
      question: 'Pull up your worst-performing validation slice—what systematic pattern causes those misclassifications?',
      lookFor: 'Concrete residual/confusion analysis rather than generic hyperparameter guessing.'
    },
    {
      topic: 'Threshold Calibration',
      question: 'If precision must exceed 0.85 in deployment, how do you pick the decision threshold without touching test data?',
      lookFor: 'Uses out-of-fold / validation precision-recall curve.'
    }
  ]
};

// Realistic historical November 2026 marathon days so the Calendar bars & Statistics charts come alive immediately
const HISTORICAL_DAYS: Record<string, HistoricalDaySummary> = {
  '2026-11-02': { dateKey: '2026-11-02', taken: 11, passed: 8, avgScore: 71, hourlyBuckets: [4, 3, 4, 0] },
  '2026-11-03': { dateKey: '2026-11-03', taken: 16, passed: 12, avgScore: 74, hourlyBuckets: [5, 4, 4, 3] },
  '2026-11-05': { dateKey: '2026-11-05', taken: 19, passed: 14, avgScore: 69, hourlyBuckets: [6, 5, 5, 3] },
  '2026-11-06': { dateKey: '2026-11-06', taken: 8, passed: 7, avgScore: 78, hourlyBuckets: [3, 3, 2, 0] },
  '2026-11-07': { dateKey: '2026-11-07', taken: 22, passed: 16, avgScore: 72, hourlyBuckets: [6, 6, 5, 5] },
  '2026-11-08': { dateKey: '2026-11-08', taken: 20, passed: 15, avgScore: 75, hourlyBuckets: [5, 6, 5, 4] },
  '2026-11-09': { dateKey: '2026-11-09', taken: 14, passed: 10, avgScore: 70, hourlyBuckets: [4, 4, 4, 2] }
};

const INITIAL_PERSONAS: Persona[] = [
  {
    id: 2,
    full_name: 'Saransh Saini',
    institute_email: 'saransh.l1@iitm.ac.in',
    role: 'EXAMINER',
    examiner_level: 'L1'
  },
  {
    id: 3,
    full_name: 'Priya Nair',
    institute_email: 'priya.l1@iitm.ac.in',
    role: 'EXAMINER',
    examiner_level: 'L1'
  },
  {
    id: 4,
    full_name: 'Rohan Mehta',
    institute_email: 'rohan.l2@iitm.ac.in',
    role: 'EXAMINER',
    examiner_level: 'L2'
  },
  {
    id: 1,
    full_name: 'Aniruddha Sir',
    institute_email: 'instructor@iitm.ac.in',
    role: 'INSTRUCTOR'
  },
  {
    id: 5,
    full_name: 'Aarav Sharma',
    institute_email: 'student1@ds.study.iitm.ac.in',
    role: 'STUDENT',
    roll_number: '23F2001045',
    notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2001045_mlp_notebook/view?usp=sharing',
    lifecycle_state: 'BOOKED_L1'
  },
  {
    id: 6,
    full_name: 'Diya Verma',
    institute_email: 'student2@ds.study.iitm.ac.in',
    role: 'STUDENT',
    roll_number: '23F2001892',
    notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2001892_mlp_notebook/view?usp=sharing',
    lifecycle_state: 'BOOKED_L1'
  },
  {
    id: 9,
    full_name: 'Vikramaditya Rao',
    institute_email: 'student5@ds.study.iitm.ac.in',
    role: 'STUDENT',
    roll_number: '23F2003118',
    notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2003118_mlp_notebook/view?usp=sharing',
    lifecycle_state: 'BOOKED_L1'
  },
  {
    id: 8,
    full_name: 'Meera Krishnan',
    institute_email: 'student4@ds.study.iitm.ac.in',
    role: 'STUDENT',
    roll_number: '23F2002310',
    notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2002310_mlp_notebook/view?usp=sharing',
    lifecycle_state: 'ELIGIBLE_L1'
  },
  {
    id: 7,
    full_name: 'Kabir Iyer',
    institute_email: 'student3@ds.study.iitm.ac.in',
    role: 'STUDENT',
    roll_number: '23F3000411',
    notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f3000411_mlp_notebook/view?usp=sharing',
    lifecycle_state: 'ELIGIBLE_L2'
  }
];

const INITIAL_RUBRICS: RubricVersion[] = [
  {
    rubric_version_id: 1,
    cycle_id: 1,
    level: 'L1',
    version_number: 1,
    title: 'L1 Core ML Pipeline & Code Ownership Rubric (v1)',
    pass_percentage: 50,
    is_active: true,
    questions: [
      {
        question_id: 1,
        display_order: 1,
        prompt: 'EDA, Data Leakage Prevention & Preprocessing Pipeline',
        max_marks: 10,
        weight_pct: 30
      },
      {
        question_id: 2,
        display_order: 2,
        prompt: 'Baseline vs. Final Model Selection & Metric Justification',
        max_marks: 10,
        weight_pct: 40
      },
      {
        question_id: 3,
        display_order: 3,
        prompt: 'Live Notebook Walkthrough & On-Spot Code Tweak',
        max_marks: 10,
        weight_pct: 30
      }
    ]
  },
  {
    rubric_version_id: 2,
    cycle_id: 1,
    level: 'L2',
    version_number: 1,
    title: 'L2 Deep-Dive Theory, Regularization & Error Diagnostics (v1)',
    pass_percentage: 60,
    is_active: true,
    questions: [
      {
        question_id: 4,
        display_order: 1,
        prompt: 'Mathematical Formulation of Chosen Estimators & Loss Functions',
        max_marks: 10,
        weight_pct: 40
      },
      {
        question_id: 5,
        display_order: 2,
        prompt: 'Bias-Variance Diagnostics, Failure Modes & Live Feature Engineering',
        max_marks: 10,
        weight_pct: 60
      }
    ]
  }
];

const INITIAL_SLOTS: SlotRecord[] = [
  {
    id: 101,
    cycle_id: 1,
    examiner_id: 2,
    examiner_name: 'Saransh Saini',
    examiner_email: 'saransh.l1@iitm.ac.in',
    level: 'L1',
    start_time: '2026-11-10T09:30:00+05:30',
    end_time: '2026-11-10T10:00:00+05:30',
    status: 'COMPLETED',
    meet_join_url: 'https://meet.google.com/iitm-mlp-slot0',
    examiner_cohost_granted: true,
    student_joined: true,
    examiner_joined: true,
    recording_active: true,
    conference_ended: true,
    recording_drive_url: 'https://drive.google.com/file/d/mlp_2026_slot0_rec/view',
    booking: {
      booking_id: 101,
      student_id: 99,
      student_name: 'Ananya Deshmukh',
      student_email: 'ananya@ds.study.iitm.ac.in',
      roll_number: '23F2000814',
      notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2000814_mlp_notebook/view?usp=sharing',
      attempt_number: 1,
      status: 'COMPLETED'
    }
  },
  {
    id: 1,
    cycle_id: 1,
    examiner_id: 2,
    examiner_name: 'Saransh Saini',
    examiner_email: 'saransh.l1@iitm.ac.in',
    level: 'L1',
    start_time: '2026-11-10T10:00:00+05:30',
    end_time: '2026-11-10T10:30:00+05:30',
    status: 'BOOKED',
    meet_join_url: 'https://meet.google.com/iitm-mlp-slot1',
    examiner_cohost_granted: true,
    student_joined: true,
    examiner_joined: true,
    recording_active: true,
    conference_ended: false,
    recording_drive_url: 'https://drive.google.com/file/d/mlp_2026_slot1_rec/view',
    booking: {
      booking_id: 1,
      student_id: 5,
      student_name: 'Aarav Sharma',
      student_email: 'student1@ds.study.iitm.ac.in',
      roll_number: '23F2001045',
      notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2001045_mlp_notebook/view?usp=sharing',
      attempt_number: 1,
      status: 'BOOKED'
    }
  },
  {
    id: 2,
    cycle_id: 1,
    examiner_id: 2,
    examiner_name: 'Saransh Saini',
    examiner_email: 'saransh.l1@iitm.ac.in',
    level: 'L1',
    start_time: '2026-11-10T10:30:00+05:30',
    end_time: '2026-11-10T11:00:00+05:30',
    status: 'BOOKED',
    meet_join_url: 'https://meet.google.com/iitm-mlp-slot2',
    examiner_cohost_granted: true,
    student_joined: true,
    examiner_joined: true,
    recording_active: false,
    conference_ended: false,
    booking: {
      booking_id: 2,
      student_id: 6,
      student_name: 'Diya Verma',
      student_email: 'student2@ds.study.iitm.ac.in',
      roll_number: '23F2001892',
      notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2001892_mlp_notebook/view?usp=sharing',
      attempt_number: 2,
      status: 'BOOKED'
    }
  },
  {
    id: 6,
    cycle_id: 1,
    examiner_id: 2,
    examiner_name: 'Saransh Saini',
    examiner_email: 'saransh.l1@iitm.ac.in',
    level: 'L1',
    start_time: '2026-11-10T11:00:00+05:30',
    end_time: '2026-11-10T11:30:00+05:30',
    status: 'BOOKED',
    meet_join_url: 'https://meet.google.com/iitm-mlp-slot6',
    examiner_cohost_granted: true,
    student_joined: false,
    examiner_joined: false,
    recording_active: false,
    conference_ended: false,
    booking: {
      booking_id: 6,
      student_id: 9,
      student_name: 'Vikramaditya Rao',
      student_email: 'student5@ds.study.iitm.ac.in',
      roll_number: '23F2003118',
      notebook_gdrive_url: 'https://drive.google.com/file/d/1iitm_23f2003118_mlp_notebook/view?usp=sharing',
      attempt_number: 1,
      status: 'BOOKED'
    }
  },
  {
    id: 3,
    cycle_id: 1,
    examiner_id: 2,
    examiner_name: 'Saransh Saini',
    examiner_email: 'saransh.l1@iitm.ac.in',
    level: 'L1',
    start_time: '2026-11-11T10:00:00+05:30',
    end_time: '2026-11-11T10:30:00+05:30',
    status: 'OPEN',
    examiner_cohost_granted: false,
    student_joined: false,
    examiner_joined: false,
    recording_active: false,
    conference_ended: false,
    booking: null
  },
  {
    id: 4,
    cycle_id: 1,
    examiner_id: 3,
    examiner_name: 'Priya Nair',
    examiner_email: 'priya.l1@iitm.ac.in',
    level: 'L1',
    start_time: '2026-11-11T10:00:00+05:30',
    end_time: '2026-11-11T10:30:00+05:30',
    status: 'OPEN',
    examiner_cohost_granted: false,
    student_joined: false,
    examiner_joined: false,
    recording_active: false,
    conference_ended: false,
    booking: null
  },
  {
    id: 7,
    cycle_id: 1,
    examiner_id: 2,
    examiner_name: 'Saransh Saini',
    examiner_email: 'saransh.l1@iitm.ac.in',
    level: 'L1',
    start_time: '2026-11-12T14:00:00+05:30',
    end_time: '2026-11-12T14:30:00+05:30',
    status: 'OPEN',
    examiner_cohost_granted: false,
    student_joined: false,
    examiner_joined: false,
    recording_active: false,
    conference_ended: false,
    booking: null
  },
  {
    id: 5,
    cycle_id: 1,
    examiner_id: 4,
    examiner_name: 'Rohan Mehta',
    examiner_email: 'rohan.l2@iitm.ac.in',
    level: 'L2',
    start_time: '2026-11-11T11:30:00+05:30',
    end_time: '2026-11-11T12:00:00+05:30',
    status: 'OPEN',
    examiner_cohost_granted: false,
    student_joined: false,
    examiner_joined: false,
    recording_active: false,
    conference_ended: false,
    booking: null
  }
];

const INITIAL_EVALUATIONS: EvaluationRecord[] = [
  {
    evaluation_id: 101,
    booking_id: 101,
    rubric_version_id: 1,
    rubric_version_number: 1,
    examiner_email: 'saransh.l1@iitm.ac.in',
    pre_approved_score: 83.0,
    recommended_outcome: 'PASS',
    examiner_overall_remarks: 'Clean leakage-free EDA; Strong code ownership',
    is_approved: true,
    approved_score: 83.0,
    final_outcome: 'PASS',
    completed_date: '2026-11-10',
    scores: [
      { question_id: 1, raw_marks: 8.5 },
      { question_id: 2, raw_marks: 8.0 },
      { question_id: 3, raw_marks: 8.5 }
    ]
  }
];

function toISTDateKey(iso: string): string {
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
    return parts; // YYYY-MM-DD
  } catch {
    return iso.slice(0, 10);
  }
}

function formatIST(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  } catch {
    return iso;
  }
}

function formatDateIST(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata'
    });
  } catch {
    return iso;
  }
}

function computeLiveBadge(slot: SlotRecord): {
  code: string;
  label: string;
  tone: 'emerald' | 'amber' | 'warm' | 'stone';
} {
  if (slot.conference_ended || slot.status === 'COMPLETED') {
    return { code: 'ENDED', label: 'Session Completed', tone: 'stone' };
  }
  if (slot.student_joined && slot.examiner_joined && slot.recording_active) {
    return { code: 'LIVE_AND_RECORDING', label: 'Live • Recording', tone: 'emerald' };
  }
  if (slot.student_joined && slot.examiner_joined && !slot.recording_active) {
    return {
      code: 'ALERT_BOTH_JOINED_NO_RECORDING',
      label: 'Both In Call • No Recording',
      tone: 'amber'
    };
  }
  if (slot.student_joined && !slot.examiner_joined) {
    return { code: 'STUDENT_JOINED_ONLY', label: 'Student Waiting', tone: 'warm' };
  }
  if (slot.examiner_joined && !slot.student_joined) {
    return { code: 'EXAMINER_JOINED_ONLY', label: 'Examiner Joined', tone: 'warm' };
  }
  return { code: 'WAITING_FOR_PARTICIPANTS', label: 'Upcoming', tone: 'stone' };
}

function copyTextSafe(text: string): boolean {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

function triggerCsvDownload(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join(
    '\n'
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const HALF_HOUR_GRID = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30'
];

export default function VivaFlowWorkspace({
  activeRoute,
  onRouteNavigate
}: {
  activeRoute?: PageRoute;
  onRouteNavigate?: (page: PageRoute) => void;
} = {}) {
  // Multi-page route state synced with URL hash (#/cockpit, #/calendar, #/statistics, #/command, #/portal)
  const [activePage, setActivePage] = useState<PageRoute>(activeRoute || 'cockpit');
  useEffect(() => {
    if (activeRoute && activeRoute !== activePage) {
      setActivePage(activeRoute);
    }
  }, [activeRoute, activePage]);
  const [compactSplitMode, setCompactSplitMode] = useState<boolean>(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState<boolean>(false);

  // Sync URL hash for true multi-page feel in browser/Canvas
  useEffect(() => {
    if (activeRoute) return;
    const readHash = () => {
      try {
        const h = window.location.hash.replace(/^#\/?/, '').trim() as PageRoute;
        if (['cockpit', 'calendar', 'statistics', 'command', 'portal'].includes(h)) {
          setActivePage(h);
        }
      } catch {
        // Ignore iframe hash limits
      }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, [activeRoute]);

  const navigateTo = useCallback(
    (page: PageRoute) => {
      setActivePage(page);
      if (onRouteNavigate) {
        onRouteNavigate(page);
      }
    },
    [onRouteNavigate]
  );

  // Backend sync
  const [apiBase] = useState<string>(
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || 'http://localhost:8000'
  );
  const [apiConnected, setApiConnected] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);

  const apiRequest = useCallback(
    async (endpoint: string, options?: RequestInit) => {
      const targetUrl = [apiBase.replace(/\/$/, ''), endpoint].join('');
      return window['fetch'](targetUrl, options);
    },
    [apiBase]
  );

  // Core relational data
  const [personas, setPersonas] = useState<Persona[]>(INITIAL_PERSONAS);
  const [activeEmail, setActiveEmail] = useState<string>('saransh.l1@iitm.ac.in');
  const [rubrics, setRubrics] = useState<RubricVersion[]>(INITIAL_RUBRICS);
  const [slots, setSlots] = useState<SlotRecord[]>(INITIAL_SLOTS);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>(INITIAL_EVALUATIONS);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([
    {
      id: 1,
      actor_email: 'instructor@iitm.ac.in',
      action: 'PROVISIONED_MEET_SPACES',
      entity_type: 'VivaCycle',
      entity_id: 1,
      summary: 'Provisioned central Google Meet links + Examiner COHOST rights for Nov 10 cohort',
      created_at: '2026-11-10T09:15:00+05:30'
    }
  ]);

  // Toast feedback
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'warn' } | null>(null);
  const notify = useCallback((text: string, kind: 'ok' | 'warn' = 'ok') => {
    setToast({ text, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const activeUser = useMemo(
    () => personas.find((p) => p.institute_email === activeEmail) || personas[0],
    [personas, activeEmail]
  );

  // Auto-route sensibly when user switches between Examiner, Instructor, or Student personas
  const handlePersonaSwitch = (email: string) => {
    setActiveEmail(email);
    const chosen = personas.find((p) => p.institute_email === email);
    if (!chosen) return;
    if (chosen.role === 'INSTRUCTOR' && (activePage === 'cockpit' || activePage === 'portal')) {
      navigateTo('command');
    } else if (chosen.role === 'STUDENT') {
      navigateTo('portal');
    } else if (chosen.role === 'EXAMINER' && (activePage === 'command' || activePage === 'portal')) {
      navigateTo('cockpit');
    }
  };

  // Hydrate full relational snapshot from FastAPI (:8000) when running locally
  const refreshFromBackend = useCallback(
    async (silent = false) => {
      setSyncing(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1600);
        const res = await apiRequest('/api/v1/slots/full-state', {
          headers: { 'X-User-Email': 'instructor@iitm.ac.in' },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
          const snap = await res.json();
          setApiConnected(true);
          if (Array.isArray(snap.personas) && snap.personas.length > 0) setPersonas(snap.personas);
          if (Array.isArray(snap.rubrics) && snap.rubrics.length > 0) setRubrics(snap.rubrics);
          if (Array.isArray(snap.slots)) setSlots(snap.slots);
          if (Array.isArray(snap.evaluations)) setEvaluations(snap.evaluations);
          if (Array.isArray(snap.audit_logs)) setAuditLogs(snap.audit_logs);
          if (!silent) notify('Connected live to FastAPI + PostgreSQL (:8000)', 'ok');
        } else {
          setApiConnected(false);
        }
      } catch {
        setApiConnected(false);
      } finally {
        setSyncing(false);
      }
    },
    [apiRequest, notify]
  );

  useEffect(() => {
    refreshFromBackend(true);
  }, [refreshFromBackend]);

  // =========================================================================
  // COCKPIT STATE (Clean, spacious, tabbed — zero stats/money clutter)
  // =========================================================================
  const [cockpitInnerTab, setCockpitInnerTab] = useState<'rubric' | 'feedback' | 'probes'>('rubric');
  const [askedProbes, setAskedProbes] = useState<Record<string, boolean>>({});
  const [sessionStreak, setSessionStreak] = useState<number>(1);

  const myExaminerSlots = useMemo(
    () =>
      slots
        .filter((s) => s.examiner_email === activeUser.institute_email)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [slots, activeUser.institute_email]
  );


  const [selectedSlotId, setSelectedSlotId] = useState<number>(1);
  useEffect(() => {
    if (activeUser.role !== 'EXAMINER') return;
    const stillValid = myExaminerSlots.some((s) => s.id === selectedSlotId && s.booking);
    if (!stillValid) {
      const firstBooked =
        myExaminerSlots.find((s) => s.booking && s.status === 'BOOKED') ||
        myExaminerSlots.find((s) => s.booking) ||
        myExaminerSlots[0];
      if (firstBooked) setSelectedSlotId(firstBooked.id);
    }
  }, [activeUser, myExaminerSlots, selectedSlotId]);

  const currentSlot = useMemo(
    () => myExaminerSlots.find((s) => s.id === selectedSlotId) || myExaminerSlots[0] || null,
    [myExaminerSlots, selectedSlotId]
  );

  const activeExaminerRubric = useMemo(() => {
    const lvl = currentSlot?.level || activeUser.examiner_level || 'L1';
    const existingEval = evaluations.find(
      (e) => e.booking_id === currentSlot?.booking?.booking_id
    );
    if (existingEval) {
      return (
        rubrics.find((r) => r.rubric_version_id === existingEval.rubric_version_id) ||
        rubrics.find((r) => r.level === lvl && r.is_active) ||
        rubrics[0]
      );
    }
    return rubrics.find((r) => r.level === lvl && r.is_active) || rubrics[0];
  }, [currentSlot, activeUser.examiner_level, evaluations, rubrics]);

  // Offline-resilient local draft persistence
  const [draftScores, setDraftScores] = useState<Record<number, Record<number, number>>>(() => {
    try {
      const saved = localStorage.getItem('vivaflow_warm_draft_scores');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return { 1: { 1: 8, 2: 7.5 } };
  });

  const [draftRemarks, setDraftRemarks] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem('vivaflow_warm_draft_remarks');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return { 1: 'Clean leakage-free EDA' };
  });

  useEffect(() => {
    try {
      localStorage.setItem('vivaflow_warm_draft_scores', JSON.stringify(draftScores));
      localStorage.setItem('vivaflow_warm_draft_remarks', JSON.stringify(draftRemarks));
    } catch {
      // Ignore
    }
  }, [draftScores, draftRemarks]);

  const [focusedQuestionIdx, setFocusedQuestionIdx] = useState<number>(0);
  const [copiedRoll, setCopiedRoll] = useState<boolean>(false);

  // 30-Minute Slot Pacing Timer
  const [secondsLeft, setSecondsLeft] = useState<number>(30 * 60);
  const [timerRunning, setTimerRunning] = useState<boolean>(true);
  useEffect(() => {
    setSecondsLeft(30 * 60);
    setFocusedQuestionIdx(0);
    setCockpitInnerTab('rubric');
  }, [selectedSlotId]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const formattedTimer = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [secondsLeft]);

  const timerProgressPct = Math.max(0, Math.min(100, (secondsLeft / (30 * 60)) * 100));

  const currentBookingId = currentSlot?.booking?.booking_id || 0;
  const currentExistingEval = useMemo(
    () => evaluations.find((e) => e.booking_id === currentBookingId) || null,
    [evaluations, currentBookingId]
  );

  const currentMarksMap: Record<number, number> = useMemo(() => {
    if (currentExistingEval) {
      const map: Record<number, number> = {};
      currentExistingEval.scores.forEach((s) => {
        map[s.question_id] = s.raw_marks;
      });
      return { ...map, ...(draftScores[currentBookingId] || {}) };
    }
    return draftScores[currentBookingId] || {};
  }, [currentExistingEval, draftScores, currentBookingId]);

  const currentRemarkText =
    draftRemarks[currentBookingId] ?? currentExistingEval?.examiner_overall_remarks ?? '';

  const liveComputedScore = useMemo(() => {
    if (!activeExaminerRubric) return { pct: 0, answered: 0, total: 0, pass: false };
    let sum = 0;
    let answered = 0;
    for (const q of activeExaminerRubric.questions) {
      const m = currentMarksMap[q.question_id];
      if (typeof m === 'number') {
        answered += 1;
        sum += (m / q.max_marks) * q.weight_pct;
      }
    }
    const pct = Math.round(sum * 100) / 100;
    return {
      pct,
      answered,
      total: activeExaminerRubric.questions.length,
      pass: pct >= activeExaminerRubric.pass_percentage
    };
  }, [activeExaminerRubric, currentMarksMap]);

  const setQuestionMark = useCallback(
    (questionId: number, mark: number, maxMarks: number, autoAdvance = false) => {
      if (!currentBookingId || currentExistingEval?.is_approved) return;
      const clamped = Math.max(0, Math.min(maxMarks, Math.round(mark * 2) / 2));
      setDraftScores((prev) => ({
        ...prev,
        [currentBookingId]: {
          ...(prev[currentBookingId] || {}),
          [questionId]: clamped
        }
      }));
      if (autoAdvance && activeExaminerRubric) {
        const idx = activeExaminerRubric.questions.findIndex((q) => q.question_id === questionId);
        if (idx >= 0 && idx < activeExaminerRubric.questions.length - 1) {
          setFocusedQuestionIdx(idx + 1);
        }
      }
    },
    [currentBookingId, currentExistingEval, activeExaminerRubric]
  );

  const toggleQuickChip = (chip: string) => {
    if (!currentBookingId || currentExistingEval?.is_approved) return;
    const current = currentRemarkText.trim();
    const updated = current.includes(chip)
      ? current
          .replace(chip, '')
          .replace(/\s*;\s*;/g, ';')
          .replace(/^;\s*|\s*;$/g, '')
          .trim()
      : current
      ? `${current}; ${chip}`
      : chip;
    setDraftRemarks((prev) => ({ ...prev, [currentBookingId]: updated }));
  };

  const stepQueue = useCallback(
    (delta: number) => {
      const bookedSlots = myExaminerSlots.filter((s) => s.booking);
      if (bookedSlots.length === 0) return;
      const idx = bookedSlots.findIndex((s) => s.id === currentSlot?.id);
      const nextIdx = (idx + delta + bookedSlots.length) % bookedSlots.length;
      setSelectedSlotId(bookedSlots[nextIdx].id);
    },
    [myExaminerSlots, currentSlot]
  );

  const handleSubmitAndNext = useCallback(async () => {
    if (!currentSlot || !currentSlot.booking || !activeExaminerRubric) return;
    if (currentExistingEval?.is_approved) {
      notify('Evaluation already approved and locked by instructor.', 'warn');
      return;
    }

    const bId = currentSlot.booking.booking_id;
    const scoresPayload: QuestionScore[] = activeExaminerRubric.questions.map((q) => ({
      question_id: q.question_id,
      raw_marks: currentMarksMap[q.question_id] ?? 0
    }));

    if (apiConnected) {
      try {
        await apiRequest('/api/v1/evaluations/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': activeUser.institute_email
          },
          body: JSON.stringify({
            booking_id: bId,
            scores: scoresPayload,
            examiner_overall_remarks: currentRemarkText
          })
        });
      } catch {
        // Optimistic update below
      }
    }

    const outcome: 'PASS' | 'FAIL' =
      liveComputedScore.pct >= activeExaminerRubric.pass_percentage ? 'PASS' : 'FAIL';

    setEvaluations((prev) => {
      const existing = prev.find((e) => e.booking_id === bId);
      const record: EvaluationRecord = {
        evaluation_id: existing ? existing.evaluation_id : prev.length + 1,
        booking_id: bId,
        rubric_version_id: activeExaminerRubric.rubric_version_id,
        rubric_version_number: activeExaminerRubric.version_number,
        examiner_email: activeUser.institute_email,
        pre_approved_score: liveComputedScore.pct,
        recommended_outcome: outcome,
        examiner_overall_remarks: currentRemarkText,
        is_approved: false,
        completed_date: toISTDateKey(currentSlot.start_time),
        scores: scoresPayload
      };
      return existing ? prev.map((e) => (e.booking_id === bId ? record : e)) : [...prev, record];
    });

    setSlots((prev) =>
      prev.map((s) =>
        s.id === currentSlot.id
          ? {
              ...s,
              status: 'COMPLETED',
              conference_ended: true,
              booking: s.booking ? { ...s.booking, status: 'COMPLETED' } : null
            }
          : s
      )
    );

    setSessionStreak((st) => st + 1);

    const nextUngraded = myExaminerSlots.find(
      (s) => s.id !== currentSlot.id && s.booking && s.status === 'BOOKED'
    );
    if (nextUngraded) {
      setSelectedSlotId(nextUngraded.id);
      notify(
        `Saved ${currentSlot.booking.student_name} (${liveComputedScore.pct}% ${outcome}) → Loaded ${nextUngraded.booking?.student_name}`
      );
    } else {
      notify(
        `Saved ${currentSlot.booking.student_name} (${liveComputedScore.pct}% ${outcome}). Active queue cleared!`
      );
    }
  }, [
    currentSlot,
    activeExaminerRubric,
    currentExistingEval,
    currentMarksMap,
    currentRemarkText,
    liveComputedScore,
    apiConnected,
    apiRequest,
    activeUser.institute_email,
    myExaminerSlots,
    notify
  ]);

  // Global Mouse-Free Examiner Hotkeys on Cockpit Page
  useEffect(() => {
    if (activePage !== 'cockpit' || activeUser.role !== 'EXAMINER') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const typingInField = tag === 'textarea' || tag === 'input' || tag === 'select';

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmitAndNext();
        return;
      }
      if (typingInField) return;

      if (e.key === '[') {
        e.preventDefault();
        stepQueue(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        stepQueue(1);
      } else if ((e.key === 'ArrowDown' || e.key === 'j') && cockpitInnerTab === 'rubric') {
        if (activeExaminerRubric) {
          e.preventDefault();
          setFocusedQuestionIdx((i) => Math.min(activeExaminerRubric.questions.length - 1, i + 1));
        }
      } else if ((e.key === 'ArrowUp' || e.key === 'k') && cockpitInnerTab === 'rubric') {
        e.preventDefault();
        setFocusedQuestionIdx((i) => Math.max(0, i - 1));
      } else if (/^[0-9]$/.test(e.key) && cockpitInnerTab === 'rubric' && activeExaminerRubric) {
        e.preventDefault();
        const q = activeExaminerRubric.questions[focusedQuestionIdx];
        if (q) {
          const val = e.key === '0' ? 10 : Number(e.key);
          setQuestionMark(q.question_id, val, q.max_marks, true);
        }
      } else if (
        e.key.toLowerCase() === 'n' &&
        (currentSlot?.booking?.notebook_gdrive_url || currentSlot?.booking?.project_repo_url)
      ) {
        const nbUrl =
          currentSlot.booking.notebook_gdrive_url || currentSlot.booking.project_repo_url || '';
        window.open(nbUrl, '_blank', 'noopener,noreferrer');
      } else if (e.key.toLowerCase() === 'm' && currentSlot?.meet_join_url) {
        window.open(currentSlot.meet_join_url, '_blank', 'noopener,noreferrer');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activePage,
    activeUser.role,
    cockpitInnerTab,
    activeExaminerRubric,
    focusedQuestionIdx,
    currentSlot,
    handleSubmitAndNext,
    setQuestionMark,
    stepQueue
  ]);

  // =========================================================================
  // CALENDAR PAGE STATE (Date-box activity bars + Day Inspector + Slot Builder)
  // =========================================================================
  const [selectedDateKey, setSelectedDateKey] = useState<string>('2026-11-10');
  const [calendarInspectorTab, setCalendarInspectorTab] = useState<'schedule' | 'publish'>('schedule');
  const [selectedHalfHours, setSelectedHalfHours] = useState<string[]>([
    '10:00',
    '10:30',
    '11:00',
    '11:30'
  ]);

  // Build November 2026 30-day calendar cells (Nov 1, 2026 is a Sunday!)
  const novemberCalendarDays = useMemo(() => {
    const scopeExaminer =
      activeUser.role === 'EXAMINER' ? activeUser.institute_email : null;

    const cells: {
      dayNum: number;
      dateKey: string;
      takenCount: number;
      bookedCount: number;
      openCount: number;
      passCount: number;
      avgScore: number;
      hourlyBuckets: number[];
    }[] = [];

    for (let day = 1; day <= 30; day++) {
      const dateKey = `2026-11-${String(day).padStart(2, '0')}`;
      const hist = HISTORICAL_DAYS[dateKey];

      const liveSlotsOnDay = slots.filter((s) => {
        if (toISTDateKey(s.start_time) !== dateKey) return false;
        if (scopeExaminer && s.examiner_email !== scopeExaminer) return false;
        return s.status !== 'CANCELLED';
      });

      const liveCompleted = liveSlotsOnDay.filter((s) => s.status === 'COMPLETED').length;
      const liveBooked = liveSlotsOnDay.filter((s) => s.status === 'BOOKED').length;
      const liveOpen = liveSlotsOnDay.filter((s) => s.status === 'OPEN').length;

      const takenCount = (hist ? hist.taken : 0) + liveCompleted;
      const passCount =
        (hist ? hist.passed : 0) +
        liveSlotsOnDay.filter((s) => {
          const ev = evaluations.find((e) => e.booking_id === s.booking?.booking_id);
          return ev?.recommended_outcome === 'PASS';
        }).length;

      // Hourly distribution across 4 shifts: Morning (9-12), Midday (12-15), Afternoon (15-18), Evening (18-21)
      const buckets = hist ? [...hist.hourlyBuckets] : [0, 0, 0, 0];
      liveSlotsOnDay.forEach((s) => {
        const hr = Number(
          new Date(s.start_time).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            timeZone: 'Asia/Kolkata'
          })
        );
        if (hr < 12) buckets[0] += 1;
        else if (hr < 15) buckets[1] += 1;
        else if (hr < 18) buckets[2] += 1;
        else buckets[3] += 1;
      });

      cells.push({
        dayNum: day,
        dateKey,
        takenCount,
        bookedCount: liveBooked,
        openCount: liveOpen,
        passCount,
        avgScore: hist ? hist.avgScore : liveCompleted > 0 ? 81 : 0,
        hourlyBuckets: buckets
      });
    }
    return cells;
  }, [slots, evaluations, activeUser]);

  const maxCalendarDayLoad = useMemo(
    () =>
      Math.max(
        16,
        ...novemberCalendarDays.map((c) => c.takenCount + c.bookedCount + c.openCount)
      ),
    [novemberCalendarDays]
  );

  const selectedDayStats = useMemo(
    () =>
      novemberCalendarDays.find((d) => d.dateKey === selectedDateKey) ||
      novemberCalendarDays[9],
    [novemberCalendarDays, selectedDateKey]
  );

  const slotsOnSelectedDate = useMemo(
    () =>
      slots
        .filter((s) => {
          if (toISTDateKey(s.start_time) !== selectedDateKey) return false;
          if (activeUser.role === 'EXAMINER' && s.examiner_email !== activeUser.institute_email) {
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [slots, selectedDateKey, activeUser]
  );

  const applyMatrixPreset = (block: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_11HR') => {
    if (block === 'MORNING') {
      setSelectedHalfHours(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
    } else if (block === 'AFTERNOON') {
      setSelectedHalfHours(['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']);
    } else if (block === 'EVENING') {
      setSelectedHalfHours(['18:00', '18:30', '19:00', '19:30', '20:00', '20:30']);
    } else {
      setSelectedHalfHours([...HALF_HOUR_GRID]);
    }
  };

  const publishSlotsForSelectedDate = async () => {
    const publishActor =
      activeUser.role === 'EXAMINER'
        ? activeUser
        : personas.find((p) => p.role === 'EXAMINER') || activeUser;

    if (selectedHalfHours.length === 0) {
      notify('Pick at least one 30-minute slot first.', 'warn');
      return;
    }
    const isoStarts = selectedHalfHours.sort().map((t) => `${selectedDateKey}T${t}:00+05:30`);

    if (apiConnected) {
      try {
        await apiRequest('/api/v1/slots/check-matrix', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': publishActor.institute_email
          },
          body: JSON.stringify({
            cycle_id: 1,
            slot_starts: isoStarts,
            duration_minutes: 30
          })
        });
      } catch {
        // Local update below
      }
    }

    let added = 0;
    setSlots((prev) => {
      const next = [...prev];
      let maxId = next.reduce((m, s) => Math.max(m, s.id), 0);
      for (const startIso of isoStarts) {
        const dup = next.some(
          (s) =>
            s.examiner_email === publishActor.institute_email &&
            new Date(s.start_time).getTime() === new Date(startIso).getTime()
        );
        if (!dup) {
          maxId += 1;
          added += 1;
          const endDate = new Date(new Date(startIso).getTime() + 30 * 60000);
          next.push({
            id: maxId,
            cycle_id: 1,
            examiner_id: publishActor.id,
            examiner_name: publishActor.full_name,
            examiner_email: publishActor.institute_email,
            level: publishActor.examiner_level || 'L1',
            start_time: startIso,
            end_time: endDate.toISOString(),
            status: 'OPEN',
            examiner_cohost_granted: false,
            student_joined: false,
            examiner_joined: false,
            recording_active: false,
            conference_ended: false,
            booking: null
          });
        }
      }
      return next;
    });
    notify(`Added ${added} open slots on ${selectedDateKey}! Watch the calendar bar update.`);
    setCalendarInspectorTab('schedule');
  };

  // =========================================================================
  // STATISTICS PAGE DATA & EXPORTS (Zero money — pure academic & viva rhythm)
  // =========================================================================
  const [statsInnerTab, setStatsInnerTab] = useState<'overview' | 'rubric' | 'exports'>('overview');

  const dailyTrendChartData = useMemo(() => {
    return novemberCalendarDays
      .filter((d) => d.takenCount > 0 || d.bookedCount > 0)
      .map((d) => ({
        day: `Nov ${d.dayNum}`,
        Taken: d.takenCount,
        Passed: d.passCount,
        Scheduled: d.bookedCount
      }));
  }, [novemberCalendarDays]);

  const rubricMasteryData = useMemo(() => {
    return [
      { criterion: 'EDA & Leakage', avgPct: 78, l1: true },
      { criterion: 'Model & Metrics', avgPct: 71, l1: true },
      { criterion: 'Live Code Tweak', avgPct: 64, l1: true },
      { criterion: 'Math & Loss (L2)', avgPct: 68, l1: false },
      { criterion: 'Error Diagnostics (L2)', avgPct: 62, l1: false }
    ];
  }, []);

  const scoreDistributionData = useMemo(() => {
    const base = [
      { band: '< 40%', count: 9, color: '#e11d48' },
      { band: '40–49%', count: 17, color: '#f97316' },
      { band: '50–64%', count: 31, color: '#d97706' },
      { band: '65–79%', count: 38, color: '#f59e0b' },
      { band: '80–100%', count: 16 + evaluations.filter((e) => e.pre_approved_score >= 80).length, color: '#10b981' }
    ];
    return base;
  }, [evaluations]);

  const totalTermVivasTaken = useMemo(
    () => novemberCalendarDays.reduce((acc, d) => acc + d.takenCount, 0),
    [novemberCalendarDays]
  );

  const totalTermPassed = useMemo(
    () => novemberCalendarDays.reduce((acc, d) => acc + d.passCount, 0),
    [novemberCalendarDays]
  );

  // =========================================================================
  // INSTRUCTOR COMMAND & STUDENT PORTAL ACTIONS
  // =========================================================================
  const [commandTab, setCommandTab] = useState<'monitor' | 'approvals' | 'rubrics' | 'fees'>(
    'monitor'
  );

  const handleProvisionAllMeets = async () => {
    if (apiConnected) {
      try {
        await apiRequest('/api/v1/meetings/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': 'instructor@iitm.ac.in'
          },
          body: JSON.stringify({ cycle_id: 1, auto_recording_enabled: false })
        });
      } catch {
        // Local update
      }
    }
    let count = 0;
    setSlots((prev) =>
      prev.map((s) => {
        if (s.status === 'BOOKED' && !s.meet_join_url) {
          count += 1;
          return {
            ...s,
            meet_join_url: `https://meet.google.com/iitm-mlp-slot${s.id}`,
            examiner_cohost_granted: true
          };
        }
        return s;
      })
    );
    notify(
      count > 0
        ? `Provisioned ${count} Google Meet space(s) with Examiner COHOST recording rights!`
        : 'All booked slots already have Google Meet links provisioned.'
    );
  };

  const toggleSlotTelemetry = async (
    slotId: number,
    field: 'student_joined' | 'examiner_joined' | 'recording_active'
  ) => {
    const target = slots.find((s) => s.id === slotId);
    if (!target) return;
    const nextVal = !target[field];

    if (apiConnected) {
      try {
        await apiRequest(`/api/v1/meetings/${slotId}/simulate-telemetry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': 'instructor@iitm.ac.in'
          },
          body: JSON.stringify({ [field]: nextVal })
        });
      } catch {
        // Local update
      }
    }

    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              [field]: nextVal,
              recording_drive_url:
                field === 'recording_active' && nextVal && !s.recording_drive_url
                  ? `https://drive.google.com/file/d/mlp_2026_slot${s.id}_mp4/view`
                  : s.recording_drive_url
            }
          : s
      )
    );
  };

  const [l2FailGrades, setL2FailGrades] = useState<Record<number, 'D' | 'E'>>({});

  const approveEvaluation = async (evalId: number) => {
    const ev = evaluations.find((e) => e.evaluation_id === evalId);
    if (!ev || ev.is_approved) return;
    const slot = slots.find((s) => s.booking?.booking_id === ev.booking_id);
    if (!slot || !slot.booking) return;

    const chosenGrade = l2FailGrades[evalId] || 'D';
    if (apiConnected) {
      try {
        await apiRequest('/api/v1/evaluations/approve-and-notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': 'instructor@iitm.ac.in'
          },
          body: JSON.stringify({
            send_result_emails: true,
            approvals: [
              {
                evaluation_id: evalId,
                assigned_letter_grade:
                  slot.level === 'L2' && ev.recommended_outcome === 'FAIL' ? chosenGrade : null
              }
            ]
          })
        });
      } catch {
        // Local update
      }
    }

    setEvaluations((prev) =>
      prev.map((item) =>
        item.evaluation_id === evalId
          ? {
              ...item,
              is_approved: true,
              approved_score: item.pre_approved_score,
              final_outcome: item.recommended_outcome,
              assigned_letter_grade:
                slot.level === 'L2' && item.recommended_outcome === 'FAIL' ? chosenGrade : null
            }
          : item
      )
    );

    const studentId = slot.booking.student_id;
    let nextLifecycle: LifecycleState = 'ELIGIBLE_L2';
    if (slot.level === 'L1') {
      nextLifecycle =
        ev.recommended_outcome === 'PASS' ? 'ELIGIBLE_L2' : 'AWAITING_IITM_FEE_CLEARANCE';
    } else {
      nextLifecycle =
        ev.recommended_outcome === 'PASS'
          ? 'PROJECT_PASSED'
          : chosenGrade === 'D'
          ? 'PROJECT_FAILED_D'
          : 'PROJECT_FAILED_E';
    }

    setPersonas((prev) =>
      prev.map((p) =>
        p.id === studentId
          ? {
              ...p,
              lifecycle_state: nextLifecycle,
              pending_reattempt_level:
                nextLifecycle === 'AWAITING_IITM_FEE_CLEARANCE' ? 'L1' : null,
              final_project_grade:
                slot.level === 'L2'
                  ? ev.recommended_outcome === 'PASS'
                    ? 'PASS'
                    : chosenGrade
                  : p.final_project_grade
            }
          : p
      )
    );

    setAuditLogs((prev) => [
      {
        id: prev.length + 1,
        actor_email: 'instructor@iitm.ac.in',
        action: 'APPROVED_EVALUATION_AND_EMAILED',
        entity_type: 'Evaluation',
        entity_id: evalId,
        summary: `Approved ${slot.booking?.student_name} (${slot.level}: ${ev.pre_approved_score}% ${ev.recommended_outcome}) & sent email → ${nextLifecycle}`,
        created_at: new Date().toISOString()
      },
      ...prev
    ]);
    notify(`Approved & emailed ${slot.booking.student_name}! Status → ${nextLifecycle}.`);
  };

  // Rubric Re-weighting & Versioning
  const [selectedRubricLevel, setSelectedRubricLevel] = useState<VivaLevel>('L1');
  const editingRubric = useMemo(
    () => rubrics.find((r) => r.level === selectedRubricLevel && r.is_active) || rubrics[0],
    [rubrics, selectedRubricLevel]
  );

  const [weightEdits, setWeightEdits] = useState<Record<number, number>>({});
  useEffect(() => {
    const map: Record<number, number> = {};
    editingRubric.questions.forEach((q) => {
      map[q.question_id] = q.weight_pct;
    });
    setWeightEdits(map);
  }, [editingRubric]);

  const weightEditSum = useMemo(
    () =>
      Math.round(
        editingRubric.questions.reduce((acc, q) => acc + (weightEdits[q.question_id] ?? 0), 0) * 10
      ) / 10,
    [editingRubric, weightEdits]
  );

  const applySafeReweight = async () => {
    if (Math.abs(weightEditSum - 100) > 0.1) {
      notify(`Weights must sum to 100% (currently ${weightEditSum}%).`, 'warn');
      return;
    }
    if (apiConnected) {
      try {
        await apiRequest(`/api/v1/rubrics/${editingRubric.rubric_version_id}/reweight`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': 'instructor@iitm.ac.in'
          },
          body: JSON.stringify({
            weights: editingRubric.questions.map((q) => ({
              question_id: q.question_id,
              weight_pct: weightEdits[q.question_id]
            }))
          })
        });
      } catch {
        // Local update
      }
    }

    setRubrics((prev) =>
      prev.map((r) =>
        r.rubric_version_id === editingRubric.rubric_version_id
          ? {
              ...r,
              questions: r.questions.map((q) => ({
                ...q,
                weight_pct: weightEdits[q.question_id] ?? q.weight_pct
              }))
            }
          : r
      )
    );

    let recomputed = 0;
    setEvaluations((prev) =>
      prev.map((ev) => {
        if (ev.rubric_version_id !== editingRubric.rubric_version_id || ev.is_approved) return ev;
        recomputed += 1;
        let weighted = 0;
        for (const sc of ev.scores) {
          const q = editingRubric.questions.find((item) => item.question_id === sc.question_id);
          if (q) {
            const newW = weightEdits[q.question_id] ?? q.weight_pct;
            weighted += (sc.raw_marks / q.max_marks) * newW;
          }
        }
        const rounded = Math.round(weighted * 100) / 100;
        return {
          ...ev,
          pre_approved_score: rounded,
          recommended_outcome: rounded >= editingRubric.pass_percentage ? 'PASS' : 'FAIL'
        };
      })
    );
    notify(`Updated weights! Recalculated ${recomputed} unapproved score(s) safely.`);
  };

  const [newQuestionPrompt, setNewQuestionPrompt] = useState<string>('');
  const publishNewRubricVersion = async () => {
    if (newQuestionPrompt.trim().length < 5) {
      notify('Enter a question prompt (5+ chars) to spawn v+1.', 'warn');
      return;
    }
    const existingQuestions = editingRubric.questions;
    const count = existingQuestions.length + 1;
    const evenWeight = Math.floor((100 / count) * 10) / 10;
    const remainder = Math.round((100 - evenWeight * (count - 1)) * 10) / 10;

    let maxQId = rubrics.flatMap((r) => r.questions).reduce((m, q) => Math.max(m, q.question_id), 0);
    const nextVersionNum = editingRubric.version_number + 1;
    const nextRvId = rubrics.reduce((m, r) => Math.max(m, r.rubric_version_id), 0) + 1;

    const newQuestions: RubricQuestion[] = [
      ...existingQuestions.map((q, idx) => {
        maxQId += 1;
        return {
          question_id: maxQId,
          display_order: idx + 1,
          prompt: q.prompt,
          max_marks: 10,
          weight_pct: evenWeight
        };
      }),
      {
        question_id: maxQId + 1,
        display_order: count,
        prompt: newQuestionPrompt.trim(),
        max_marks: 10,
        weight_pct: remainder
      }
    ];

    setRubrics((prev) => [
      ...prev.map((r) => (r.level === selectedRubricLevel ? { ...r, is_active: false } : r)),
      {
        rubric_version_id: nextRvId,
        cycle_id: 1,
        level: selectedRubricLevel,
        version_number: nextVersionNum,
        title: `${selectedRubricLevel} Updated Rubric (v${nextVersionNum})`,
        pass_percentage: editingRubric.pass_percentage,
        is_active: true,
        questions: newQuestions
      }
    ]);

    if (apiConnected) {
      try {
        await apiRequest('/api/v1/rubrics/new-version', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': 'instructor@iitm.ac.in'
          },
          body: JSON.stringify({
            cycle_id: 1,
            level: selectedRubricLevel,
            title: `${selectedRubricLevel} Updated Rubric (v${nextVersionNum})`,
            pass_percentage: editingRubric.pass_percentage,
            questions: newQuestions.map((q) => ({
              prompt: q.prompt,
              max_marks: q.max_marks,
              weight_pct: q.weight_pct,
              display_order: q.display_order
            }))
          })
        });
      } catch {
        // Keep local optimistic update
      }
    }
    setNewQuestionPrompt('');
    notify(`Spawned ${selectedRubricLevel} Rubric v${nextVersionNum}! Historical v${editingRubric.version_number} rows remain untouched.`);
  };

  // Student Portal bookings & fee unlocks
  const pooledWindowsForStudent = useMemo(() => {
    const targetLevel: VivaLevel =
      activeUser.lifecycle_state === 'ELIGIBLE_L2' || activeUser.lifecycle_state === 'BOOKED_L2'
        ? 'L2'
        : 'L1';
    const map = new Map<
      string,
      { level: VivaLevel; start_time: string; end_time: string; open: number; total: number }
    >();
    for (const s of slots) {
      if (s.level !== targetLevel || s.status === 'CANCELLED') continue;
      const key = `${s.level}|${s.start_time}`;
      const cur = map.get(key) || {
        level: s.level,
        start_time: s.start_time,
        end_time: s.end_time,
        open: 0,
        total: 0
      };
      cur.total += 1;
      if (s.status === 'OPEN') cur.open += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }, [slots, activeUser.lifecycle_state]);

  const myStudentSlots = useMemo(
    () => slots.filter((s) => s.booking?.student_email === activeUser.institute_email),
    [slots, activeUser.institute_email]
  );

  const [notebookGdriveUrl, setNotebookGdriveUrl] = useState<string>('');

  const isNotebookUrlValid = useMemo(() => {
    const u = notebookGdriveUrl.trim();
    return (
      u.startsWith('https://drive.google.com/') ||
      u.startsWith('https://colab.research.google.com/') ||
      u.startsWith('https://docs.google.com/')
    );
  }, [notebookGdriveUrl]);

  const reserveStudentWindow = async (level: VivaLevel, startIso: string) => {
    const canBookL1 = level === 'L1' && activeUser.lifecycle_state === 'ELIGIBLE_L1';
    const canBookL2 = level === 'L2' && activeUser.lifecycle_state === 'ELIGIBLE_L2';
    if (!canBookL1 && !canBookL2) {
      notify(`Current status (${activeUser.lifecycle_state}) is not eligible to book ${level}.`, 'warn');
      return;
    }

    const cleanNbUrl = notebookGdriveUrl.trim();
    if (
      !cleanNbUrl.startsWith('https://drive.google.com/') &&
      !cleanNbUrl.startsWith('https://colab.research.google.com/') &&
      !cleanNbUrl.startsWith('https://docs.google.com/')
    ) {
      notify(
        'Please paste your public Google Drive or Colab .ipynb notebook link before reserving a slot.',
        'warn'
      );
      return;
    }

    if (apiConnected) {
      try {
        await apiRequest('/api/v1/bookings/reserve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': activeUser.institute_email
          },
          body: JSON.stringify({
            cycle_id: 1,
            level,
            window_start: startIso,
            notebook_gdrive_url: cleanNbUrl
          })
        });
      } catch {
        // Local update
      }
    }

    const openCandidates = slots.filter(
      (s) => s.level === level && s.start_time === startIso && s.status === 'OPEN'
    );
    if (openCandidates.length === 0) {
      notify('All seats in that window were just taken!', 'warn');
      return;
    }

    openCandidates.sort((a, b) => {
      const loadA = slots.filter((x) => x.examiner_id === a.examiner_id && x.status !== 'OPEN').length;
      const loadB = slots.filter((x) => x.examiner_id === b.examiner_id && x.status !== 'OPEN').length;
      return loadA - loadB;
    });

    const chosen = openCandidates[0];
    const nextBookingId = slots.reduce((m, s) => Math.max(m, s.booking?.booking_id || 0), 0) + 1;

    setSlots((prev) =>
      prev.map((s) =>
        s.id === chosen.id
          ? {
              ...s,
              status: 'BOOKED',
              booking: {
                booking_id: nextBookingId,
                student_id: activeUser.id,
                student_name: activeUser.full_name,
                student_email: activeUser.institute_email,
                roll_number: activeUser.roll_number || '23F2009999',
                notebook_gdrive_url: cleanNbUrl,
                project_repo_url: cleanNbUrl,
                attempt_number: 1,
                status: 'BOOKED'
              }
            }
          : s
      )
    );

    setPersonas((prev) =>
      prev.map((p) =>
        p.id === activeUser.id
          ? { ...p, lifecycle_state: level === 'L1' ? 'BOOKED_L1' : 'BOOKED_L2' }
          : p
      )
    );
    setNotebookGdriveUrl('');
    notify(`Reserved ${level} window at ${formatIST(startIso)} with notebook link attached!`);
  };

  const [rescheduleReason, setRescheduleReason] = useState<string>('');
  const [rescheduleSlotId, setRescheduleSlotId] = useState<number | null>(null);

  const submitStudentReschedule = async (slotId: number) => {
    if (rescheduleReason.trim().length < 5) {
      notify('Enter a brief reschedule reason (5+ chars).', 'warn');
      return;
    }
    const target = slots.find((s) => s.id === slotId);
    if (!target || !target.booking) return;

    if (apiConnected) {
      try {
        await apiRequest(`/api/v1/bookings/${target.booking.booking_id}/request-reschedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': activeUser.institute_email
          },
          body: JSON.stringify({ reason: rescheduleReason.trim() })
        });
      } catch {
        // Local update
      }
    }

    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, status: 'OPEN', booking: null } : s))
    );
    setPersonas((prev) =>
      prev.map((p) =>
        p.id === activeUser.id
          ? {
              ...p,
              lifecycle_state: 'AWAITING_IITM_FEE_CLEARANCE',
              pending_reattempt_level: target.level
            }
          : p
      )
    );
    setRescheduleSlotId(null);
    setRescheduleReason('');
    notify('Reschedule requested; slot returned to open pool.');
  };

  const [invoiceRefs, setInvoiceRefs] = useState<Record<number, string>>({});
  const unlockStudentFee = async (studentId: number) => {
    const ref = (invoiceRefs[studentId] || 'IITM-INV-2026-9012').trim();
    const stu = personas.find((p) => p.id === studentId);
    if (!stu) return;
    const lvl = stu.pending_reattempt_level || 'L1';

    if (apiConnected) {
      try {
        await apiRequest(`/api/v1/bookings/students/${studentId}/clear-fee`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': 'instructor@iitm.ac.in'
          },
          body: JSON.stringify({ iitm_fee_invoice_ref: ref })
        });
      } catch {
        // Local update
      }
    }

    setPersonas((prev) =>
      prev.map((p) =>
        p.id === studentId
          ? {
              ...p,
              lifecycle_state: lvl === 'L1' ? 'ELIGIBLE_L1' : 'ELIGIBLE_L2',
              pending_reattempt_level: null
            }
          : p
      )
    );
    notify(`Cleared ${stu.full_name} (${ref}) for ${lvl} slot booking.`);
  };

  // Academic & Session Exports (No money fields)
  const downloadExaminerSessionLog = async (fmt: 'csv' | 'xlsx' = 'csv') => {
    if (apiConnected) {
      try {
        const res = await apiRequest(`/api/v1/exports/examiner-vivas?format=${fmt}`, {
          headers: { 'X-User-Email': activeUser.institute_email }
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `examiner_viva_sessions.${fmt}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          notify(`Exported ${fmt.toUpperCase()} session log!`);
          return;
        }
      } catch {
        // Client CSV fallback
      }
    }
    const gradedByMe = evaluations.filter((e) => e.examiner_email === activeUser.institute_email);
    const rows: (string | number)[][] = gradedByMe.map((ev) => {
      const sl = slots.find((s) => s.booking?.booking_id === ev.booking_id);
      return [
        ev.booking_id,
        sl?.level || 'L1',
        sl ? formatIST(sl.start_time) : '',
        sl?.booking?.student_name || '',
        sl?.booking?.roll_number || '',
        ev.pre_approved_score,
        ev.recommended_outcome,
        ev.is_approved ? 'APPROVED' : 'PENDING'
      ];
    });
    triggerCsvDownload(
      'examiner_viva_sessions.csv',
      ['Booking ID', 'Level', 'Slot IST', 'Student Name', 'Roll Number', 'Score (%)', 'Outcome', 'Approval'],
      rows
    );
    notify('Downloaded Examiner Viva Session CSV!');
  };

  const downloadMasterGradebook = async (fmt: 'csv' | 'xlsx' = 'csv') => {
    if (apiConnected) {
      try {
        const res = await apiRequest(`/api/v1/exports/instructor-gradebook?cycle_id=1&format=${fmt}`, {
          headers: { 'X-User-Email': 'instructor@iitm.ac.in' }
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `iitm_ml_viva_master_gradebook.${fmt}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          notify(`Exported Master Gradebook (${fmt.toUpperCase()})!`);
          return;
        }
      } catch {
        // Fallback below
      }
    }
    const bookedOrDone = slots.filter((s) => s.booking);
    const rows = bookedOrDone.map((s) => {
      const ev = evaluations.find((e) => e.booking_id === s.booking?.booking_id);
      const stu = personas.find((p) => p.id === s.booking?.student_id);
      return [
        s.booking?.booking_id || '',
        s.booking?.roll_number || '',
        s.booking?.student_name || '',
        s.level,
        s.examiner_email,
        formatIST(s.start_time),
        s.recording_active ? 'YES' : 'NO',
        ev ? `v${ev.rubric_version_number}` : '',
        ev ? ev.pre_approved_score : '',
        ev?.final_outcome || ev?.recommended_outcome || 'PENDING',
        stu?.final_project_grade || ''
      ];
    });
    triggerCsvDownload(
      'iitm_ml_viva_master_gradebook.csv',
      ['Booking ID', 'Roll No', 'Student', 'Level', 'Examiner', 'Slot IST', 'Recorded', 'Rubric', 'Score (%)', 'Outcome', 'Grade'],
      rows
    );
    notify('Downloaded Master Cohort Gradebook CSV!');
  };

  // Multi-page sidebar items
  const navPages: { id: PageRoute; label: string; sub: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'cockpit', label: 'Viva Cockpit', sub: 'Focused grading', icon: Sparkles },
    { id: 'calendar', label: 'Schedule & Bars', sub: 'Calendar & slots', icon: CalendarIcon },
    { id: 'statistics', label: 'Analytics', sub: 'Trends & exports', icon: BarChart3 },
    { id: 'command', label: 'Command Center', sub: 'Live Meet & rubrics', icon: LayoutDashboard },
    { id: 'portal', label: 'Student Portal', sub: 'Slot booking', icon: UserCheck }
  ];

  return (
    <div className="min-h-screen bg-[#0b0a09] text-stone-100 flex flex-col lg:flex-row font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <style>{`
        @keyframes vivaPageEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes eqPulse {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
        .viva-page-anim {
          animation: vivaPageEnter 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .eq-bar-1 { animation: eqPulse 0.9s ease-in-out infinite; }
        .eq-bar-2 { animation: eqPulse 0.7s ease-in-out 0.15s infinite; }
        .eq-bar-3 { animation: eqPulse 1.05s ease-in-out 0.3s infinite; }
      `}</style>

      {/* Warm Ambient Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md viva-page-anim">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md text-sm font-medium ${
              toast.kind === 'warn'
                ? 'bg-[#241610]/95 border-orange-500/50 text-orange-100'
                : 'bg-[#171411]/95 border-amber-500/50 text-stone-100'
            }`}
          >
            {toast.kind === 'warn' ? (
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* Hotkeys Reference Modal */}
      {showHotkeysModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-stone-800 bg-[#141210] p-6 shadow-2xl viva-page-anim">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5 font-semibold text-stone-100">
                <Keyboard className="w-4 h-4 text-amber-400" />
                <span>Zero-Mouse Cockpit Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHotkeysModal(false)}
                className="px-3 py-1 rounded-xl text-xs border border-stone-700 bg-stone-900 hover:bg-stone-800 text-stone-300 transition"
              >
                Esc / Close
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              {[
                ['1 – 9, 0', 'Score 1–9 or 10 on focused criterion & advance'],
                ['↑ / ↓ or K / J', 'Move focus between rubric criteria'],
                ['[  and  ]', 'Previous / Next student in queue'],
                ['N', 'Open student Project Notebook (Google Drive)'],
                ['M', 'Open Google Meet room'],
                ['Cmd / Ctrl + Enter', 'Submit evaluation & load next student']
              ].map(([k, desc]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-3 py-2 border-b border-stone-800/80 last:border-b-0"
                >
                  <code className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono shrink-0">
                    {k}
                  </code>
                  <span className="text-xs text-stone-400 text-right">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MULTI-PAGE WARM OBSIDIAN SIDEBAR NAVIGATION
          (Automatically collapses when 50/50 Meet Dock is enabled!)
         ===================================================================== */}
      {!compactSplitMode && (
        <aside className="lg:w-64 shrink-0 bg-[#110f0d] border-b lg:border-b-0 lg:border-r border-stone-800/80 flex flex-col justify-between p-4">
          <div className="space-y-6">
            {/* Brand Header */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-stone-950 font-extrabold text-sm shadow-lg shadow-amber-500/20">
                  VF
                </div>
                <div>
                  <div className="font-bold text-sm tracking-tight text-stone-100">VivaFlow</div>
                  <div className="text-[11px] text-stone-400">IITM ML Evaluation Suite</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => refreshFromBackend(false)}
                title="Sync with FastAPI (:8000)"
                className={`p-2 rounded-xl border transition ${
                  apiConnected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-amber-300'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Multi-Page Route Links */}
            <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {navPages.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all duration-200 shrink-0 ${
                      active
                        ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/40 text-amber-200 shadow-md shadow-black/30'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/80 border border-transparent'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        active
                          ? 'bg-amber-500 text-stone-950 shadow-sm shadow-amber-500/40'
                          : 'bg-stone-900 text-stone-400 group-hover:text-amber-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="hidden sm:block">
                      <div className="text-xs font-semibold leading-tight">{item.label}</div>
                      <div className="text-[11px] text-stone-500 leading-tight mt-0.5">
                        {item.sub}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Role / Persona Switcher & Wellness Status */}
          <div className="hidden lg:block space-y-3 pt-4 border-t border-stone-800/80">
            <div className="rounded-2xl bg-[#171412] border border-stone-800/90 p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-stone-400">
                <span>Active Persona (`X-User-Email`)</span>
                <span className="text-amber-400 font-semibold">{activeUser.role}</span>
              </div>
              <select
                aria-label="Switch Active Persona"
                value={activeEmail}
                onChange={(e) => handlePersonaSwitch(e.target.value)}
                className="w-full rounded-xl bg-[#0e0c0b] border border-stone-700/80 px-2.5 py-2 text-xs text-stone-200 font-medium focus:outline-none focus:border-amber-500"
              >
                {personas.map((p) => (
                  <option key={p.institute_email} value={p.institute_email}>
                    {p.role === 'EXAMINER'
                      ? `${p.full_name} (${p.examiner_level})`
                      : p.role === 'INSTRUCTOR'
                      ? `${p.full_name} (Instructor)`
                      : `${p.full_name} (${p.lifecycle_state})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between px-2 text-[11px] text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    apiConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                {apiConnected ? 'FastAPI :8000 Connected' : 'Local Demo Sync'}
              </span>
              <span>2026-T3</span>
            </div>
          </div>
        </aside>
      )}

      {/* =====================================================================
          MAIN PAGE VIEWPORT
         ===================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sleek Top Context Strip */}
        <header className="bg-[#110f0d]/90 backdrop-blur-md border-b border-stone-800/80 px-6 py-3 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {compactSplitMode && (
                <div className="flex items-center gap-1 mr-2">
                  {navPages.slice(0, 3).map((np) => (
                    <button
                      key={np.id}
                      type="button"
                      onClick={() => navigateTo(np.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        activePage === np.id
                          ? 'bg-amber-500 text-stone-950 font-semibold'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {np.label}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <h1 className="text-base font-bold text-stone-100 tracking-tight">
                  {activePage === 'cockpit' && 'Examiner Viva Cockpit'}
                  {activePage === 'calendar' && 'Viva Calendar & Daily Activity Bars'}
                  {activePage === 'statistics' && 'Cohort & Rubric Analytics'}
                  {activePage === 'command' && 'Instructor Command Center'}
                  {activePage === 'portal' && 'Student Viva Booking Portal'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Mobile/Compact Persona Switcher */}
              <select
                aria-label="Mobile Persona Switcher"
                value={activeEmail}
                onChange={(e) => handlePersonaSwitch(e.target.value)}
                className="lg:hidden rounded-xl bg-[#171412] border border-stone-700 px-2.5 py-1.5 text-xs text-stone-200"
              >
                {personas.map((p) => (
                  <option key={p.institute_email} value={p.institute_email}>
                    {p.full_name} ({p.role})
                  </option>
                ))}
              </select>

              {activePage === 'cockpit' && (
                <>
                  {/* Subtle Marathon Wellness Streak Pill */}
                  <div
                    title="Eye-strain reminder for long viva marathons"
                    className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#191613] border border-stone-800 text-xs text-stone-300"
                  >
                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Block Streak: <strong className="text-amber-300">{sessionStreak}</strong>
                      {sessionStreak % 4 === 0 ? ' • Take a 30s eye rest!' : ''}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCompactSplitMode((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition active:scale-[0.98] ${
                      compactSplitMode
                        ? 'bg-amber-500 text-stone-950 border-amber-400 font-semibold'
                        : 'bg-[#191613] border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <Columns className="w-3.5 h-3.5" />
                    <span>{compactSplitMode ? 'Exit 50/50 Dock' : '50/50 Meet Dock'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHotkeysModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#191613] border border-stone-800 text-stone-300 hover:border-stone-700 transition"
                  >
                    <Keyboard className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Shortcuts</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ===================================================================
            PAGE 1: CLEAN, UNCLUTTERED VIVA COCKPIT
           =================================================================== */}
        {activePage === 'cockpit' && (
          <main
            key="page-cockpit"
            className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 viva-page-anim"
          >
            {activeUser.role !== 'EXAMINER' ? (
              <div className="rounded-3xl border border-stone-800 bg-[#151311] p-10 text-center space-y-4">
                <Sparkles className="w-8 h-8 text-amber-400 mx-auto" />
                <h2 className="text-lg font-bold">Examiner Cockpit Requires an Examiner Persona</h2>
                <p className="text-sm text-stone-400 max-w-md mx-auto">
                  You are currently viewing as <strong>{activeUser.full_name}</strong> ({activeUser.role}).
                  Switch to Saransh Saini (L1) or Rohan Mehta (L2) to grade live vivas.
                </p>
                <button
                  type="button"
                  onClick={() => handlePersonaSwitch('saransh.l1@iitm.ac.in')}
                  className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition"
                >
                  Switch to Saransh Saini (L1 Examiner)
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                {/* Full-Width Focused Viva Grading Canvas */}
                <div className="flex-1 min-w-0 space-y-5">
                  {!currentSlot || !currentSlot.booking ? (
                    <div className="rounded-3xl border border-stone-800 bg-[#151311] p-12 text-center space-y-3">
                      <CalendarIcon className="w-8 h-8 text-amber-400 mx-auto" />
                      <h2 className="text-base font-semibold">No Booked Viva Selected</h2>
                      <p className="text-sm text-stone-400">
                        Pick a student from your queue or visit the Schedule &amp; Bars page to publish slots.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Warm Recording Safety Banner */}
                      {currentSlot.student_joined &&
                        currentSlot.examiner_joined &&
                        !currentSlot.recording_active &&
                        currentSlot.status !== 'COMPLETED' && (
                          <div className="rounded-2xl bg-orange-950/50 border border-orange-500/50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-orange-100 text-xs viva-page-anim">
                            <div className="flex items-center gap-2.5">
                              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                              <span>
                                Both participants are in Google Meet, but{' '}
                                <strong>recording has not started yet</strong>.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleSlotTelemetry(currentSlot.id, 'recording_active')}
                              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition active:scale-[0.98]"
                            >
                              Confirm Recording Started
                            </button>
                          </div>
                        )}

                      {/* Spacious Student Dossier Card */}
                      <div className="rounded-3xl border border-stone-800/90 bg-[#151311] p-5 shadow-xl shadow-black/30 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                                {currentSlot.level}
                              </span>
                              <h2 className="text-xl font-bold text-stone-100 tracking-tight">
                                {currentSlot.booking.student_name}
                              </h2>
                              <button
                                type="button"
                                onClick={() => {
                                  copyTextSafe(currentSlot.booking?.roll_number || '');
                                  setCopiedRoll(true);
                                  setTimeout(() => setCopiedRoll(false), 1400);
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d0c0b] border border-stone-800 hover:border-stone-700 text-xs font-mono text-stone-300 transition"
                              >
                                <span>{currentSlot.booking.roll_number}</span>
                                {copiedRoll ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3 text-stone-500" />
                                )}
                              </button>

                              {/* Animated Live Audio/Recording Equalizer Pill */}
                              {currentSlot.recording_active && currentSlot.status !== 'COMPLETED' && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                                  <span className="flex items-end gap-0.5 h-3">
                                    <span className="w-0.5 h-full bg-emerald-400 rounded-full eq-bar-1" />
                                    <span className="w-0.5 h-full bg-emerald-400 rounded-full eq-bar-2" />
                                    <span className="w-0.5 h-full bg-emerald-400 rounded-full eq-bar-3" />
                                  </span>
                                  <span>Rec Active</span>
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-stone-400 flex flex-wrap items-center gap-2.5">
                              <span>
                                {formatIST(currentSlot.start_time)} – {formatIST(currentSlot.end_time)} IST
                              </span>
                              <span>•</span>
                              <span>{currentSlot.booking.student_email}</span>
                            </div>
                          </div>

                          {/* Top-Right Quick Launchers + Prev/Next */}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => stepQueue(-1)}
                              title="Previous Student [ "
                              className="p-2 rounded-xl bg-[#0e0d0c] border border-stone-800 hover:border-stone-700 text-stone-300 transition"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => stepQueue(1)}
                              title="Next Student ]"
                              className="p-2 rounded-xl bg-[#0e0d0c] border border-stone-800 hover:border-stone-700 text-stone-300 transition"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>

                            {(currentSlot.booking.notebook_gdrive_url ||
                              currentSlot.booking.project_repo_url) && (
                              <a
                                href={
                                  currentSlot.booking.notebook_gdrive_url ||
                                  currentSlot.booking.project_repo_url ||
                                  '#'
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1e1b18] hover:bg-[#27231f] border border-stone-700/80 text-xs font-semibold text-stone-200 transition active:scale-[0.98]"
                              >
                                <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
                                <span>View Project Notebook (N)</span>
                                <ExternalLink className="w-3 h-3 text-stone-500" />
                              </a>
                            )}

                            {currentSlot.meet_join_url && (
                              <a
                                href={currentSlot.meet_join_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-md shadow-amber-500/15 transition active:scale-[0.98]"
                              >
                                <Video className="w-3.5 h-3.5" />
                                <span>Join Meet (M)</span>
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Smooth 30-Minute Pacing Bar */}
                        <div className="pt-2 border-t border-stone-800/80 flex items-center gap-3">
                          <div className="inline-flex items-center gap-2 text-xs font-mono text-stone-300 shrink-0">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span
                              className={
                                secondsLeft <= 180 ? 'text-orange-400 font-bold' : 'font-semibold'
                              }
                            >
                              {formattedTimer}
                            </span>
                          </div>
                          <div className="flex-1 h-1.5 rounded-full bg-stone-900 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                secondsLeft <= 180
                                  ? 'bg-orange-500'
                                  : secondsLeft <= 360
                                  ? 'bg-amber-400'
                                  : 'bg-amber-500/70'
                              }`}
                              style={{ width: `${timerProgressPct}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setTimerRunning((r) => !r)}
                              aria-label="Pause or resume viva timer"
                              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
                            >
                              {timerRunning ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSecondsLeft(30 * 60)}
                              aria-label="Reset 30m viva timer"
                              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Clean Inner Tabs — Keeps Cockpit Uncrowded & Calm */}
                      <div className="flex items-center gap-2 border-b border-stone-800/90 pb-2">
                        {[
                          {
                            id: 'rubric',
                            label: `Rubric (${liveComputedScore.answered}/${liveComputedScore.total})`,
                            icon: Sliders
                          },
                          {
                            id: 'feedback',
                            label: currentRemarkText ? 'Feedback Notes •' : 'Feedback Notes',
                            icon: MessageSquareText
                          },
                          {
                            id: 'probes',
                            label: 'Smart Viva Probes',
                            icon: Lightbulb
                          }
                        ].map((tab) => {
                          const Icon = tab.icon;
                          const active = cockpitInnerTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() =>
                                setCockpitInnerTab(tab.id as 'rubric' | 'feedback' | 'probes')
                              }
                              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                                active
                                  ? 'bg-[#211d19] text-amber-300 border border-amber-500/40'
                                  : 'text-stone-400 hover:text-stone-200 hover:bg-[#161412]'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span>{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* INNER TAB 1: SPACIOUS 1-TAP RUBRIC CARDS */}
                      {cockpitInnerTab === 'rubric' && (
                        <div className="space-y-3.5 viva-page-anim">
                          {activeExaminerRubric?.questions.map((q, idx) => {
                            const selectedVal = currentMarksMap[q.question_id];
                            const isFocused = focusedQuestionIdx === idx;
                            return (
                              <div
                                key={q.question_id}
                                onClick={() => setFocusedQuestionIdx(idx)}
                                className={`rounded-3xl border p-5 transition-all duration-200 ${
                                  isFocused
                                    ? 'bg-[#1a1714] border-amber-500/50 shadow-lg shadow-black/30'
                                    : 'bg-[#141210] border-stone-800/90 hover:border-stone-700'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={`w-7 h-7 rounded-xl text-xs font-bold flex items-center justify-center transition-colors ${
                                        isFocused
                                          ? 'bg-amber-500 text-stone-950'
                                          : 'bg-stone-900 text-stone-400'
                                      }`}
                                    >
                                      {idx + 1}
                                    </span>
                                    <span className="text-sm font-semibold text-stone-100">
                                      {q.prompt}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-stone-500">
                                      {q.weight_pct}% weight
                                    </span>
                                    <span className="font-mono font-bold text-base text-amber-300 min-w-[56px] text-right">
                                      {typeof selectedVal === 'number' ? selectedVal : '—'}
                                      <span className="text-xs text-stone-500 font-normal">
                                        /{q.max_marks}
                                      </span>
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {SCORE_PILLS.map((val) => {
                                    const active = selectedVal === val;
                                    return (
                                      <button
                                        key={val}
                                        type="button"
                                        disabled={Boolean(currentExistingEval?.is_approved)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setQuestionMark(q.question_id, val, q.max_marks, true);
                                        }}
                                        className={`h-10 min-w-[44px] px-3 rounded-xl text-xs font-bold border transition-all duration-150 active:scale-[0.95] ${
                                          active
                                            ? val >= 5
                                              ? 'bg-amber-500 text-stone-950 border-amber-300 shadow-md shadow-amber-500/20 scale-[1.03]'
                                              : 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20 scale-[1.03]'
                                            : 'bg-[#0e0d0c] hover:bg-[#201c18] text-stone-300 border-stone-800'
                                        }`}
                                      >
                                        {val}
                                      </button>
                                    );
                                  })}

                                  <div className="ml-auto flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={Boolean(currentExistingEval?.is_approved)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setQuestionMark(
                                          q.question_id,
                                          (selectedVal ?? 5) - 0.5,
                                          q.max_marks,
                                          false
                                        );
                                      }}
                                      className="h-10 px-3 rounded-xl text-xs font-mono bg-[#0e0d0c] hover:bg-[#201c18] border border-stone-800 text-stone-400 transition"
                                    >
                                      -0.5
                                    </button>
                                    <button
                                      type="button"
                                      disabled={Boolean(currentExistingEval?.is_approved)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setQuestionMark(
                                          q.question_id,
                                          (selectedVal ?? 5) + 0.5,
                                          q.max_marks,
                                          false
                                        );
                                      }}
                                      className="h-10 px-3 rounded-xl text-xs font-mono bg-[#0e0d0c] hover:bg-[#201c18] border border-stone-800 text-stone-400 transition"
                                    >
                                      +0.5
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* INNER TAB 2: QUICK FEEDBACK CHIPS & NOTES */}
                      {cockpitInnerTab === 'feedback' && (
                        <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-4 viva-page-anim">
                          <div className="text-xs text-stone-400">
                            Tap any preset observation chip to append it without typing—everything
                            auto-saves locally as you go.
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {QUICK_REMARK_CHIPS.map((chip) => {
                              const active = currentRemarkText.includes(chip);
                              return (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => toggleQuickChip(chip)}
                                  className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-all active:scale-[0.97] ${
                                    active
                                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                      : 'bg-[#0e0d0c] border-stone-800 text-stone-300 hover:border-stone-700'
                                  }`}
                                >
                                  {active ? `✓ ${chip}` : `+ ${chip}`}
                                </button>
                              );
                            })}
                          </div>
                          <textarea
                            rows={4}
                            value={currentRemarkText}
                            disabled={Boolean(currentExistingEval?.is_approved)}
                            onChange={(e) =>
                              setDraftRemarks((prev) => ({
                                ...prev,
                                [currentBookingId]: e.target.value
                              }))
                            }
                            placeholder="Write additional viva observations here..."
                            className="w-full rounded-2xl bg-[#0c0b0a] border border-stone-800 focus:border-amber-500 px-4 py-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none"
                          />
                        </div>
                      )}

                      {/* INNER TAB 3: SMART VIVA PROBE BANK (Saves mental energy on 12h shifts!) */}
                      {cockpitInnerTab === 'probes' && (
                        <div className="space-y-3 viva-page-anim">
                          {(PROBE_BANK[currentSlot.level] || PROBE_BANK.L1).map((probe, idx) => {
                            const key = `${currentBookingId}-${idx}`;
                            const asked = Boolean(askedProbes[key]);
                            return (
                              <div
                                key={probe.topic}
                                className={`rounded-3xl border p-5 transition ${
                                  asked
                                    ? 'bg-[#121613] border-emerald-500/30'
                                    : 'bg-[#141210] border-stone-800/90'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                                    {probe.topic}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAskedProbes((prev) => ({ ...prev, [key]: !asked }))
                                    }
                                    className={`px-3 py-1 rounded-xl text-xs font-semibold border transition ${
                                      asked
                                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                        : 'bg-[#0e0d0c] border-stone-800 text-stone-400 hover:text-stone-200'
                                    }`}
                                  >
                                    {asked ? '✓ Asked in Viva' : 'Mark Asked'}
                                  </button>
                                </div>
                                <p className="text-sm font-medium text-stone-100">
                                  &ldquo;{probe.question}&rdquo;
                                </p>
                                <p className="text-xs text-stone-400 mt-2">
                                  <strong className="text-stone-300">What to listen for:</strong>{' '}
                                  {probe.lookFor}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Calm Bottom Submit Bar */}
                      <div className="rounded-3xl border border-stone-800/90 bg-[#151311] px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-xl shadow-black/40">
                        <div className="flex items-center gap-4">
                          <div className="text-3xl font-extrabold font-mono text-stone-100">
                            {liveComputedScore.pct.toFixed(1)}%
                          </div>
                          <div>
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                                liveComputedScore.pass
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {liveComputedScore.pass ? 'PASS' : 'FAIL'}
                            </span>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              Threshold: {activeExaminerRubric?.pass_percentage}%
                            </div>
                          </div>
                        </div>

                        {currentExistingEval?.is_approved ? (
                          <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                            <ShieldCheck className="w-4 h-4" />
                            Approved &amp; Locked by Instructor
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleSubmitAndNext}
                            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-stone-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {currentExistingEval
                                ? 'Update & Next Student'
                                : 'Submit & Next Student'}
                            </span>
                            <span className="text-xs font-mono opacity-80">⌘↵</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Slim Right-Side Vertical Numbered Queue Boxes (Time shown ONLY on hover) */}
                {!compactSplitMode && (
                  <aside
                    aria-label="Scheduled Viva Queue"
                    className="sticky top-20 flex flex-col items-center gap-2 p-2 rounded-2xl border border-stone-800/90 bg-[#141210] shadow-xl shadow-black/30 shrink-0"
                  >
                    <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 px-1 pt-0.5">
                      Slots
                    </span>
                    {myExaminerSlots.filter((s) => s.booking).length === 0 ? (
                      <div className="w-10 h-10 rounded-xl bg-[#0e0d0c] border border-stone-800 flex items-center justify-center text-xs text-stone-600 font-mono">
                        0
                      </div>
                    ) : (
                      myExaminerSlots
                        .filter((s) => s.booking)
                        .map((slot, idx) => {
                          const selected = currentSlot?.id === slot.id;
                          const isDone = slot.status === 'COMPLETED';
                          const hoverTime = `${formatIST(slot.start_time)} – ${formatIST(
                            slot.end_time
                          )} IST`;
                          return (
                            <div key={slot.id} className="relative group">
                              <button
                                type="button"
                                onClick={() => setSelectedSlotId(slot.id)}
                                aria-label={`Slot ${idx + 1} (${hoverTime})`}
                                className={`w-10 h-10 rounded-xl font-mono text-xs font-bold border transition-all duration-150 active:scale-95 flex items-center justify-center ${
                                  selected
                                    ? 'bg-amber-500 text-stone-950 border-amber-300 shadow-md shadow-amber-500/25 scale-105'
                                    : isDone
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:border-emerald-400'
                                    : 'bg-[#0e0d0c] text-stone-300 border-stone-800 hover:border-amber-500/50 hover:text-amber-300'
                                }`}
                              >
                                {idx + 1}
                              </button>

                              {/* Hover-Only Scheduled Time Tooltip (Zero upcoming student info revealed) */}
                              <div className="pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150 absolute right-12 top-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1.5 rounded-xl bg-[#1c1815] border border-amber-500/40 text-xs font-mono text-amber-200 shadow-2xl z-40">
                                {hoverTime}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </aside>
                )}
              </div>
            )}
          </main>
        )}

        {/* ===================================================================
            PAGE 2: INTERACTIVE VIVA CALENDAR WITH EMBEDDED DATE-BOX BARS
           =================================================================== */}
        {activePage === 'calendar' && (
          <main
            key="page-calendar"
            className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 space-y-6 viva-page-anim"
          >
            {/* Legend & Month Summary Ribbon */}
            <div className="rounded-3xl border border-stone-800/90 bg-[#141210] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  November 2026 • Viva Examination Cycle
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  Click any date box to inspect its shift rhythm, jump to a student, or publish
                  availability slots.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-2 text-stone-300">
                  <span className="w-3 h-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-300" />
                  Completed Vivas Bar
                </span>
                <span className="inline-flex items-center gap-2 text-stone-300">
                  <span className="w-3 h-2 rounded-full bg-orange-500/60" />
                  Booked / Open Bar
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium">
                  <Flame className="w-3.5 h-3.5" />
                  16+ Marathon Day
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 7-Column Calendar Grid with Visual Activity Bars Inside Each Box */}
              <section className="lg:col-span-8 rounded-3xl border border-stone-800/90 bg-[#141210] p-5">
                <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Nov 1, 2026 starts directly on Sunday (index 0)! */}
                <div className="grid grid-cols-7 gap-2">
                  {novemberCalendarDays.map((cell) => {
                    const isSelected = cell.dateKey === selectedDateKey;
                    const isToday = cell.dateKey === '2026-11-10';
                    const totalLoad = cell.takenCount + cell.bookedCount + cell.openCount;
                    const takenPct = Math.min(
                      100,
                      Math.round((cell.takenCount / maxCalendarDayLoad) * 100)
                    );
                    const scheduledPct = Math.min(
                      100 - takenPct,
                      Math.round(((cell.bookedCount + cell.openCount) / maxCalendarDayLoad) * 100)
                    );
                    const isMarathon = cell.takenCount >= 16;

                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        onClick={() => setSelectedDateKey(cell.dateKey)}
                        className={`group min-h-[92px] p-2.5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-200 active:scale-[0.97] ${
                          isSelected
                            ? 'bg-[#221c16] border-amber-400 ring-1 ring-amber-400/40 shadow-lg shadow-black/50'
                            : isMarathon
                            ? 'bg-[#191511] border-amber-500/30 hover:border-amber-500/60'
                            : totalLoad > 0
                            ? 'bg-[#12100e] border-stone-800 hover:border-stone-700'
                            : 'bg-[#0d0c0b] border-stone-900/80 hover:border-stone-800 opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span
                            className={`text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center ${
                              isToday
                                ? 'bg-amber-500 text-stone-950'
                                : isSelected
                                ? 'text-amber-300'
                                : 'text-stone-300'
                            }`}
                          >
                            {cell.dayNum}
                          </span>
                          {isMarathon && <Flame className="w-3 h-3 text-amber-400" />}
                        </div>

                        {/* Lively Embedded Bars Inside Date Cell */}
                        <div className="w-full space-y-1.5 mt-2">
                          {totalLoad > 0 ? (
                            <>
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-amber-300 font-semibold">
                                  {cell.takenCount > 0 ? `${cell.takenCount} done` : ''}
                                </span>
                                {cell.bookedCount + cell.openCount > 0 && (
                                  <span className="text-stone-400">
                                    +{cell.bookedCount + cell.openCount}
                                  </span>
                                )}
                              </div>
                              {/* Segmented Horizontal Activity Bar */}
                              <div className="w-full h-2 rounded-full bg-stone-900 overflow-hidden flex gap-0.5">
                                {takenPct > 0 && (
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                                    style={{ width: `${Math.max(14, takenPct)}%` }}
                                  />
                                )}
                                {scheduledPct > 0 && (
                                  <div
                                    className="h-full rounded-full bg-orange-500/55 transition-all duration-500"
                                    style={{ width: `${Math.max(12, scheduledPct)}%` }}
                                  />
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] text-stone-600">Rest / Free</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Right Day Inspector & 2-Click Slot Publisher */}
              <aside className="lg:col-span-4 rounded-3xl border border-stone-800/90 bg-[#141210] p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-amber-400">{selectedDateKey}</div>
                    <h2 className="text-base font-bold text-stone-100">
                      {formatDateIST(`${selectedDateKey}T10:00:00+05:30`)}
                    </h2>
                  </div>
                  <div className="flex rounded-xl bg-[#0c0b0a] p-0.5 border border-stone-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setCalendarInspectorTab('schedule')}
                      className={`px-3 py-1 rounded-lg font-medium transition ${
                        calendarInspectorTab === 'schedule'
                          ? 'bg-amber-500 text-stone-950 font-semibold'
                          : 'text-stone-400'
                      }`}
                    >
                      Insights
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarInspectorTab('publish')}
                      className={`px-3 py-1 rounded-lg font-medium transition ${
                        calendarInspectorTab === 'publish'
                          ? 'bg-amber-500 text-stone-950 font-semibold'
                          : 'text-stone-400'
                      }`}
                    >
                      + Slots
                    </button>
                  </div>
                </div>

                {calendarInspectorTab === 'schedule' ? (
                  <div className="space-y-4 viva-page-anim">
                    {/* Day Mini-Metrics */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-[#0e0d0c] border border-stone-800/80 p-3">
                        <div className="text-[11px] text-stone-500">Taken</div>
                        <div className="text-lg font-extrabold font-mono text-amber-300">
                          {selectedDayStats.takenCount}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[#0e0d0c] border border-stone-800/80 p-3">
                        <div className="text-[11px] text-stone-500">Talk Hrs</div>
                        <div className="text-lg font-extrabold font-mono text-stone-200">
                          {(selectedDayStats.takenCount * 0.5).toFixed(1)}h
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[#0e0d0c] border border-stone-800/80 p-3">
                        <div className="text-[11px] text-stone-500">Pass Rate</div>
                        <div className="text-lg font-extrabold font-mono text-emerald-400">
                          {selectedDayStats.takenCount > 0
                            ? `${Math.round(
                                (selectedDayStats.passCount / selectedDayStats.takenCount) * 100
                              )}%`
                            : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Shift Rhythm Spark-Bars (Morning / Midday / Afternoon / Evening) */}
                    <div className="rounded-2xl bg-[#0e0d0c] border border-stone-800/80 p-3.5 space-y-2.5">
                      <div className="text-xs font-semibold text-stone-300">
                        Shift Density Rhythm
                      </div>
                      {[
                        ['Morning (09–12)', selectedDayStats.hourlyBuckets[0]],
                        ['Midday (12–15)', selectedDayStats.hourlyBuckets[1]],
                        ['Afternoon (15–18)', selectedDayStats.hourlyBuckets[2]],
                        ['Evening (18–21)', selectedDayStats.hourlyBuckets[3]]
                      ].map(([label, cnt]) => {
                        const pct = Math.min(100, (Number(cnt) / 7) * 100);
                        return (
                          <div key={String(label)} className="space-y-1">
                            <div className="flex justify-between text-[11px] text-stone-400">
                              <span>{label}</span>
                              <span className="font-mono text-amber-300">{cnt} slots</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-stone-900 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-500/80 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Live Slots on Selected Date */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {slotsOnSelectedDate.length === 0 ? (
                        <div className="text-xs text-stone-500 text-center py-4">
                          {selectedDayStats.takenCount > 0
                            ? `${selectedDayStats.takenCount} archived vivas completed on this date.`
                            : 'No live slots scheduled yet—click "+ Slots" above to add availability.'}
                        </div>
                      ) : (
                        slotsOnSelectedDate.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-2xl bg-[#0e0d0c] border border-stone-800/80 p-3 flex items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-mono text-amber-300 font-semibold">
                                {formatIST(s.start_time)} • {s.level}
                              </div>
                              <div className="text-stone-300 mt-0.5">
                                {s.booking ? s.booking.student_name : 'Open Pool Slot'}
                              </div>
                            </div>
                            {s.booking && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSlotId(s.id);
                                  navigateTo('cockpit');
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-semibold transition"
                              >
                                Open →
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 viva-page-anim">
                    <div className="text-xs text-stone-400">
                      Quick-select 30-min blocks on <strong>{selectedDateKey}</strong>:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ['MORNING', 'Morning'],
                        ['AFTERNOON', 'Afternoon'],
                        ['EVENING', 'Evening'],
                        ['FULL_11HR', 'Full Day']
                      ].map(([code, lbl]) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() =>
                            applyMatrixPreset(
                              code as 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_11HR'
                            )
                          }
                          className="px-2.5 py-1 rounded-lg text-xs bg-[#0e0d0c] border border-stone-800 hover:border-amber-500/40 text-stone-300 transition"
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 max-h-60 overflow-y-auto pr-1">
                      {HALF_HOUR_GRID.map((hhmm) => {
                        const on = selectedHalfHours.includes(hhmm);
                        return (
                          <button
                            key={hhmm}
                            type="button"
                            onClick={() =>
                              setSelectedHalfHours((prev) =>
                                prev.includes(hhmm)
                                  ? prev.filter((x) => x !== hhmm)
                                  : [...prev, hhmm]
                              )
                            }
                            className={`py-2 rounded-xl text-xs font-mono font-semibold border transition ${
                              on
                                ? 'bg-amber-500 text-stone-950 border-amber-400'
                                : 'bg-[#0e0d0c] border-stone-800 text-stone-400'
                            }`}
                          >
                            {hhmm}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={publishSlotsForSelectedDate}
                      className="w-full py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition active:scale-[0.98]"
                    >
                      Publish {selectedHalfHours.length} Slots on {selectedDateKey}
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </main>
        )}

        {/* ===================================================================
            PAGE 3: DEDICATED ANALYTICS & EXPORTS PAGE
           =================================================================== */}
        {activePage === 'statistics' && (
          <main
            key="page-statistics"
            className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 space-y-6 viva-page-anim"
          >
            {/* Top Metric Strip (Purely academic & operational — zero money!) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Vivas Evaluated', val: totalTermVivasTaken, sub: 'Nov 2026 Cycle' },
                {
                  label: 'Cohort Pass Rate',
                  val: `${Math.round((totalTermPassed / Math.max(1, totalTermVivasTaken)) * 100)}%`,
                  sub: `${totalTermPassed} cleared to next stage`
                },
                { label: 'Mean Viva Score', val: '73.4%', sub: 'Weighted rubric average' },
                {
                  label: 'Recording Compliance',
                  val: '98.2%',
                  sub: 'Verified via Meet telemetry'
                }
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-3xl border border-stone-800/90 bg-[#141210] p-5"
                >
                  <div className="text-xs text-stone-400">{card.label}</div>
                  <div className="text-2xl font-extrabold font-mono text-amber-300 mt-1.5">
                    {card.val}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1">{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Clean Tabs inside Analytics */}
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-stone-800/90 pb-3">
              <div className="flex items-center gap-2">
                {[
                  { id: 'overview', label: 'Daily Velocity & Score Curve', icon: TrendingUp },
                  { id: 'rubric', label: 'Criterion Mastery & Funnel', icon: Filter },
                  { id: 'exports', label: 'CSV / Excel Exports', icon: Download }
                ].map((t) => {
                  const Icon = t.icon;
                  const active = statsInnerTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setStatsInnerTab(t.id as 'overview' | 'rubric' | 'exports')}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                        active
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'bg-[#151311] text-stone-400 hover:text-stone-200 border border-stone-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {statsInnerTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 viva-page-anim">
                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-5 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-stone-100">
                      Daily Vivas Taken vs. Passed
                    </h3>
                    <p className="text-xs text-stone-400">
                      Tracks marathon load and daily pass consistency across November
                    </p>
                  </div>
                  <div className="relative h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyTrendChartData}>
                        <defs>
                          <linearGradient id="warmTakenGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="warmPassGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                        <XAxis dataKey="day" stroke="#78716c" fontSize={11} />
                        <YAxis stroke="#78716c" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#171412',
                            borderColor: '#44403c',
                            borderRadius: '12px',
                            fontSize: '12px',
                            color: '#f5f5f4'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="Taken"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          fill="url(#warmTakenGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="Passed"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#warmPassGrad)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-5 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-stone-100">
                      Cohort Score Distribution
                    </h3>
                    <p className="text-xs text-stone-400">
                      Weighted evaluation scores grouped by performance band
                    </p>
                  </div>
                  <div className="relative h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={scoreDistributionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                        <XAxis dataKey="band" stroke="#78716c" fontSize={11} />
                        <YAxis stroke="#78716c" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#171412',
                            borderColor: '#44403c',
                            borderRadius: '12px',
                            fontSize: '12px',
                            color: '#f5f5f4'
                          }}
                        />
                        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                          {scoreDistributionData.map((entry) => (
                            <Cell key={entry.band} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {statsInnerTab === 'rubric' && (
              <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-4 viva-page-anim">
                <h3 className="text-sm font-bold text-stone-100">
                  Average Student Mastery by Rubric Criterion
                </h3>
                <div className="space-y-3.5">
                  {rubricMasteryData.map((row) => (
                    <div key={row.criterion} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-stone-200">{row.criterion}</span>
                        <span className="font-mono text-amber-300 font-bold">{row.avgPct}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-stone-900 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
                          style={{ width: `${row.avgPct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {statsInnerTab === 'exports' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 viva-page-anim">
                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-4">
                  <h3 className="text-base font-bold text-stone-100">
                    Examiner Viva Session Log
                  </h3>
                  <p className="text-xs text-stone-400">
                    Download your completed viva evaluations, timestamps, roll numbers, and
                    instructor approval statuses in CSV or formatted Excel.
                  </p>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => downloadExaminerSessionLog('csv')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadExaminerSessionLog('xlsx')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#201c18] hover:bg-[#2a2520] border border-stone-700 text-stone-200 font-semibold text-xs transition"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>Download Excel (.xlsx)</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-4">
                  <h3 className="text-base font-bold text-stone-100">
                    Master Instructor Cohort Gradebook
                  </h3>
                  <p className="text-xs text-stone-400">
                    Full L1 &amp; L2 cohort export including Google Drive recording links, rubric
                    versions, approved scores, and final D/E project grades.
                  </p>
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => downloadMasterGradebook('csv')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Master CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadMasterGradebook('xlsx')}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#201c18] hover:bg-[#2a2520] border border-stone-700 text-stone-200 font-semibold text-xs transition"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>Master Excel (.xlsx)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        )}

        {/* ===================================================================
            PAGE 4: INSTRUCTOR COMMAND CENTER (TABBED, UNCLUTTERED)
           =================================================================== */}
        {activePage === 'command' && (
          <main
            key="page-command"
            className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 space-y-6 viva-page-anim"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800/90 pb-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'monitor', label: 'Live Meet Monitor', icon: Radio },
                  {
                    id: 'approvals',
                    label: `Approvals (${evaluations.filter((e) => !e.is_approved).length})`,
                    icon: Award
                  },
                  { id: 'rubrics', label: 'Rubric Studio', icon: Layers },
                  {
                    id: 'fees',
                    label: `Reschedule Queue (${
                      personas.filter((p) => p.lifecycle_state === 'AWAITING_IITM_FEE_CLEARANCE')
                        .length
                    })`,
                    icon: Unlock
                  }
                ].map((t) => {
                  const Icon = t.icon;
                  const active = commandTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setCommandTab(t.id as 'monitor' | 'approvals' | 'rubrics' | 'fees')
                      }
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                        active
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'bg-[#151311] text-stone-400 hover:text-stone-200 border border-stone-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleProvisionAllMeets}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition active:scale-[0.98]"
              >
                <Video className="w-3.5 h-3.5" />
                <span>1-Click Provision Google Meets</span>
              </button>
            </div>

            {commandTab === 'monitor' && (
              <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 overflow-x-auto viva-page-anim">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-800 text-stone-400">
                      <th className="py-2.5 pr-4">Slot (IST)</th>
                      <th className="py-2.5 pr-4">Student</th>
                      <th className="py-2.5 pr-4">Examiner (COHOST)</th>
                      <th className="py-2.5 pr-4">Live Status</th>
                      <th className="py-2.5">Simulate Meet Webhook (Demo)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots
                      .filter((s) => s.booking)
                      .map((s) => {
                        const b = computeLiveBadge(s);
                        return (
                          <tr key={s.id} className="border-b border-stone-800/60 last:border-b-0">
                            <td className="py-3.5 pr-4 font-mono text-amber-300">
                              {formatIST(s.start_time)} ({s.level})
                            </td>
                            <td className="py-3.5 pr-4">
                              <div className="font-semibold text-stone-100">
                                {s.booking?.student_name}
                              </div>
                              <div className="text-[11px] text-stone-500">
                                {s.booking?.roll_number}
                              </div>
                            </td>
                            <td className="py-3.5 pr-4 text-stone-300">{s.examiner_name}</td>
                            <td className="py-3.5 pr-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                  b.tone === 'emerald'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : b.tone === 'amber'
                                    ? 'bg-orange-500/20 text-orange-200 animate-pulse'
                                    : 'bg-stone-800 text-stone-300'
                                }`}
                              >
                                {b.label}
                              </span>
                            </td>
                            <td className="py-3.5">
                              <div className="flex flex-wrap gap-1.5">
                                {(
                                  [
                                    ['student_joined', 'Student In'],
                                    ['examiner_joined', 'Examiner In'],
                                    ['recording_active', 'Recording']
                                  ] as const
                                ).map(([field, lbl]) => (
                                  <button
                                    key={field}
                                    type="button"
                                    onClick={() => toggleSlotTelemetry(s.id, field)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] border font-medium transition ${
                                      s[field]
                                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                        : 'bg-[#0d0c0b] border-stone-800 text-stone-400'
                                    }`}
                                  >
                                    {s[field] ? `✓ ${lbl}` : lbl}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {commandTab === 'approvals' && (
              <div className="space-y-3 viva-page-anim">
                {evaluations.map((ev) => {
                  const slot = slots.find((s) => s.booking?.booking_id === ev.booking_id);
                  const needsLetter =
                    slot?.level === 'L2' && ev.recommended_outcome === 'FAIL' && !ev.is_approved;
                  return (
                    <div
                      key={ev.evaluation_id}
                      className="rounded-3xl border border-stone-800/90 bg-[#141210] p-5 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-sm text-stone-100">
                            {slot?.booking?.student_name || `Booking #${ev.booking_id}`}
                          </span>
                          <span className="text-xs font-mono text-amber-400">
                            {slot?.level || 'L1'} • Rubric v{ev.rubric_version_number}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                              ev.recommended_outcome === 'PASS'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {ev.pre_approved_score}% • {ev.recommended_outcome}
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 mt-1">
                          Examiner: {ev.examiner_email} • {ev.examiner_overall_remarks || 'No notes'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {needsLetter && (
                          <select
                            aria-label="Select D or E grade"
                            value={l2FailGrades[ev.evaluation_id] || 'D'}
                            onChange={(e) =>
                              setL2FailGrades((prev) => ({
                                ...prev,
                                [ev.evaluation_id]: e.target.value as 'D' | 'E'
                              }))
                            }
                            className="rounded-xl bg-[#0c0b0a] border border-stone-700 px-3 py-1.5 text-xs text-stone-200"
                          >
                            <option value="D">Project Grade: D</option>
                            <option value="E">Project Grade: E</option>
                          </select>
                        )}
                        {ev.is_approved ? (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approved &amp; Emailed
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => approveEvaluation(ev.evaluation_id)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>Approve &amp; Send Result Email</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {commandTab === 'rubrics' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 viva-page-anim">
                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-stone-100">
                      Safe Question Re-Weighting
                    </h3>
                    <div className="flex gap-1.5">
                      {(['L1', 'L2'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setSelectedRubricLevel(lvl)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold ${
                            selectedRubricLevel === lvl
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-[#0d0c0b] text-stone-400 border border-stone-800'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {editingRubric.questions.map((q) => (
                      <div
                        key={q.question_id}
                        className="rounded-2xl bg-[#0e0d0c] border border-stone-800 p-3.5"
                      >
                        <div className="text-xs font-medium text-stone-200 mb-2">{q.prompt}</div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={5}
                            max={90}
                            step={5}
                            value={weightEdits[q.question_id] ?? q.weight_pct}
                            onChange={(e) =>
                              setWeightEdits((prev) => ({
                                ...prev,
                                [q.question_id]: Number(e.target.value)
                              }))
                            }
                            className="flex-1 accent-amber-500"
                          />
                          <span className="font-mono text-xs font-bold text-amber-300 w-12 text-right">
                            {weightEdits[q.question_id] ?? q.weight_pct}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span
                      className={`text-xs font-mono font-bold ${
                        Math.abs(weightEditSum - 100) < 0.1 ? 'text-emerald-400' : 'text-orange-400'
                      }`}
                    >
                      Sum: {weightEditSum}% / 100%
                    </span>
                    <button
                      type="button"
                      onClick={applySafeReweight}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition"
                    >
                      Apply Weights Safely
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-4">
                  <h3 className="text-sm font-bold text-stone-100">
                    Publish New Rubric Version (v{editingRubric.version_number + 1})
                  </h3>
                  <p className="text-xs text-stone-400">
                    Adding or editing questions creates an immutable new version for upcoming vivas
                    so completed evaluations never break in PostgreSQL.
                  </p>
                  <input
                    type="text"
                    value={newQuestionPrompt}
                    onChange={(e) => setNewQuestionPrompt(e.target.value)}
                    placeholder="Enter new rubric criterion prompt..."
                    className="w-full rounded-2xl bg-[#0c0b0a] border border-stone-800 px-4 py-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={publishNewRubricVersion}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#241e18] hover:bg-[#2f271f] border border-amber-500/40 text-amber-300 font-bold text-xs transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Spawn {selectedRubricLevel} Rubric v{editingRubric.version_number + 1}</span>
                  </button>
                </div>
              </div>
            )}

            {commandTab === 'fees' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 viva-page-anim">
                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-3">
                  <h3 className="text-sm font-bold text-stone-100">
                    IITM Reschedule &amp; Reattempt Unlocks
                  </h3>
                  {personas.filter((p) => p.lifecycle_state === 'AWAITING_IITM_FEE_CLEARANCE')
                    .length === 0 ? (
                    <p className="text-xs text-stone-500 py-4">
                      No students awaiting external IITM reschedule invoice clearance.
                    </p>
                  ) : (
                    personas
                      .filter((p) => p.lifecycle_state === 'AWAITING_IITM_FEE_CLEARANCE')
                      .map((stu) => (
                        <div
                          key={stu.id}
                          className="rounded-2xl bg-[#0e0d0c] border border-stone-800 p-3.5 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-xs font-bold text-stone-100">{stu.full_name}</div>
                            <div className="text-[11px] text-stone-500">{stu.institute_email}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="IITM Invoice Ref..."
                              value={invoiceRefs[stu.id] || ''}
                              onChange={(e) =>
                                setInvoiceRefs((prev) => ({ ...prev, [stu.id]: e.target.value }))
                              }
                              className="rounded-xl bg-[#141210] border border-stone-700 px-2.5 py-1 text-xs w-36 text-stone-200"
                            />
                            <button
                              type="button"
                              onClick={() => unlockStudentFee(stu.id)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs"
                            >
                              Unlock
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>

                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-3">
                  <h3 className="text-sm font-bold text-stone-100">Recent Audit Log</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-2xl bg-[#0e0d0c] border border-stone-800 p-3 text-xs"
                      >
                        <div className="flex justify-between font-mono text-[11px] text-amber-400">
                          <span>{log.action}</span>
                          <span>{formatIST(log.created_at)}</span>
                        </div>
                        <p className="text-stone-300 mt-1">{log.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </main>
        )}

        {/* ===================================================================
            PAGE 5: STUDENT PORTAL
           =================================================================== */}
        {activePage === 'portal' && (
          <main
            key="page-portal"
            className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 space-y-6 viva-page-anim"
          >
            {activeUser.role !== 'STUDENT' ? (
              <div className="rounded-3xl border border-stone-800 bg-[#141210] p-8 text-center space-y-3">
                <UserCheck className="w-7 h-7 text-amber-400 mx-auto" />
                <h2 className="text-base font-bold">Preview Student Booking Portal</h2>
                <p className="text-xs text-stone-400">
                  Switch to a student persona to test pooled 30-minute slot reservation and
                  reschedule requests.
                </p>
                <button
                  type="button"
                  onClick={() => handlePersonaSwitch('student4@ds.study.iitm.ac.in')}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs"
                >
                  Switch to Meera Krishnan (Eligible L1 Student)
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-amber-400">{activeUser.roll_number}</div>
                    <h2 className="text-xl font-bold text-stone-100 mt-0.5">
                      {activeUser.full_name}
                    </h2>
                    <div className="text-xs text-stone-400">{activeUser.institute_email}</div>
                  </div>
                  <span className="px-4 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                    {activeUser.lifecycle_state}
                  </span>
                </div>

                {myStudentSlots.length > 0 && (
                  <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-3">
                    <h3 className="text-sm font-bold">Scheduled Viva Session</h3>
                    {myStudentSlots.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-2xl bg-[#0e0d0c] border border-stone-800 p-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-semibold text-stone-100">
                            {s.level} Viva • {formatDateIST(s.start_time)} ({formatIST(s.start_time)})
                          </div>
                          <div className="text-xs text-stone-400 mt-0.5">
                            Examiner: {s.examiner_name}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {(s.booking?.notebook_gdrive_url || s.booking?.project_repo_url) && (
                            <a
                              href={
                                s.booking?.notebook_gdrive_url ||
                                s.booking?.project_repo_url ||
                                '#'
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1b1815] hover:bg-[#25211d] border border-stone-700 text-xs font-semibold text-stone-200 transition"
                            >
                              <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
                              <span>My Notebook (.ipynb)</span>
                            </a>
                          )}
                          {s.meet_join_url && (
                            <a
                              href={s.meet_join_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Join Meet</span>
                            </a>
                          )}
                          {s.status === 'BOOKED' && (
                            <button
                              type="button"
                              onClick={() => setRescheduleSlotId(s.id)}
                              className="px-3.5 py-2 rounded-xl bg-[#1b1815] border border-stone-700 text-xs text-stone-300"
                            >
                              Request Reschedule
                            </button>
                          )}
                        </div>
                        {rescheduleSlotId === s.id && (
                          <div className="w-full pt-3 mt-2 border-t border-stone-800 flex gap-2">
                            <input
                              type="text"
                              value={rescheduleReason}
                              onChange={(e) => setRescheduleReason(e.target.value)}
                              placeholder="Brief reason for reschedule..."
                              className="flex-1 rounded-xl bg-[#141210] border border-stone-700 px-3 py-1.5 text-xs text-stone-200"
                            />
                            <button
                              type="button"
                              onClick={() => submitStudentReschedule(s.id)}
                              className="px-4 py-1.5 rounded-xl bg-amber-500 text-stone-950 font-bold text-xs"
                            >
                              Submit Request
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-3xl border border-stone-800/90 bg-[#141210] p-6 space-y-5">
                  <div>
                    <h3 className="text-sm font-bold text-stone-100">
                      Book Your Viva Slot &amp; Submit Notebook
                    </h3>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Paste your publicly viewable Google Drive (or Colab) <code>.ipynb</code> link
                      below, then pick any open 30-minute window.
                    </p>
                  </div>

                  {/* Step 1: Required Public Google Drive .ipynb Link Input */}
                  <div className="rounded-2xl bg-[#0e0d0c] border border-stone-800 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="student-notebook-url"
                        className="text-xs font-semibold text-stone-200 flex items-center gap-2"
                      >
                        <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Public Google Drive Notebook Link (.ipynb)</span>
                      </label>
                      {isNotebookUrlValid ? (
                        <span className="text-[11px] font-medium text-emerald-400">
                          ✓ Ready to attach
                        </span>
                      ) : (
                        <span className="text-[11px] text-stone-500">
                          Set Drive access to &ldquo;Anyone with the link&rdquo;
                        </span>
                      )}
                    </div>
                    <input
                      id="student-notebook-url"
                      type="url"
                      value={notebookGdriveUrl}
                      onChange={(e) => setNotebookGdriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                      className="w-full rounded-xl bg-[#141210] border border-stone-700/90 focus:border-amber-500 px-3.5 py-2.5 text-xs text-stone-100 placeholder-stone-600 focus:outline-none transition"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pooledWindowsForStudent.map((w) => (
                      <div
                        key={`${w.level}-${w.start_time}`}
                        className="rounded-2xl bg-[#0e0d0c] border border-stone-800 p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-mono text-amber-400">
                            {w.level} • {formatDateIST(w.start_time)}
                          </div>
                          <div className="text-sm font-bold text-stone-100 mt-0.5">
                            {formatIST(w.start_time)} – {formatIST(w.end_time)}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5">
                            {w.open} of {w.total} open
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={w.open === 0}
                          onClick={() => reserveStudentWindow(w.level, w.start_time)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                            w.open > 0
                              ? 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                              : 'bg-stone-900 text-stone-600 cursor-not-allowed'
                          }`}
                        >
                          {w.open > 0 ? 'Reserve' : 'Full'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </main>
        )}
      </div>
    </div>
  );
}