/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Folder, FileText, Image as ImageIcon, Plus, ChevronRight, ChevronDown, Home, Trash2, Edit2, X, AlertCircle, Maximize, ZoomIn, ZoomOut, Network, Calendar, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './supabase';
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addYears,
  subYears,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isSameWeek,
  addDays,
} from 'date-fns';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

// Error Boundary Component
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertCircle className="w-8 h-8" />
              <h2 className="text-xl font-bold">Something went wrong</h2>
            </div>
            <p className="text-gray-600 mb-6">
              The application encountered an error. This might be due to a connection issue or security rules.
            </p>
            <div className="bg-red-50 p-4 rounded-lg mb-6 overflow-auto max-h-40">
              <code className="text-xs text-red-800">{this.state.errorInfo}</code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-2 rounded-xl font-medium hover:bg-red-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Module = {
  id: string;
  title: string;
  summary: string;
  text: string;
  images: string[];
  parentId: string | null;
  children: string[];
  calendarMarkerColor?: CalendarMarkerColor;
};

type CalendarMarkerColor = 'blue' | 'lightGreen' | 'green' | 'red' | 'orange' | 'yellow' | 'purple';
type TrainingIntensity = 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple';
type CalendarMode = 'year' | 'week' | 'month';

interface TrainingPlan {
  id: string;
  title: string;
  details: string;
  intensity: TrainingIntensity;
  completed: boolean;
  startTime: string;
  durationMinutes: number;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleSupabaseError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: null,
    operationType,
    path
  };
  console.error('Supabase Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

const createSafeUploadFileName = (moduleId: string, fileName: string) => {
  const extensionMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'bin';
  return `${moduleId}/${Date.now()}-upload.${extension}`;
};

const generateId = () => Math.random().toString(36).substring(2, 9);
const TRAINING_PLANS_STORAGE_KEY = 'training-plans';

const CALENDAR_MARKER_STORAGE_KEY = 'calendar-marker-colors';
const DEFAULT_CALENDAR_MARKER_COLOR: CalendarMarkerColor = 'blue';
const CALENDAR_MARKER_OPTIONS: Array<{
  value: CalendarMarkerColor;
  label: string;
  hex: string;
  cellBackground: string;
}> = [
  { value: 'blue', label: 'Blue', hex: '#2563eb', cellBackground: '#eff6ff' },
  { value: 'lightGreen', label: 'Light Green', hex: '#4ade80', cellBackground: '#f0fdf4' },
  { value: 'green', label: 'Dark Green', hex: '#15803d', cellBackground: '#ecfdf5' },
  { value: 'red', label: 'Red', hex: '#dc2626', cellBackground: '#fef2f2' },
  { value: 'orange', label: 'Orange', hex: '#ea580c', cellBackground: '#fff7ed' },
  { value: 'yellow', label: 'Yellow', hex: '#eab308', cellBackground: '#fefce8' },
  { value: 'purple', label: 'Purple', hex: '#9333ea', cellBackground: '#faf5ff' },
];

const CALENDAR_MARKER_COLOR_MAP = Object.fromEntries(
  CALENDAR_MARKER_OPTIONS.map(option => [option.value, option])
) as Record<CalendarMarkerColor, (typeof CALENDAR_MARKER_OPTIONS)[number]>;

const isCalendarModuleId = (id: string) => id.startsWith('cal_');

const isCalendarMarkerColor = (value: unknown): value is CalendarMarkerColor =>
  typeof value === 'string' && value in CALENDAR_MARKER_COLOR_MAP;

const normalizeCalendarMarkerColor = (value: unknown): CalendarMarkerColor =>
  isCalendarMarkerColor(value) ? value : DEFAULT_CALENDAR_MARKER_COLOR;

const TRAINING_INTENSITY_STYLES: Record<TrainingIntensity, { block: string; accent: string; border: string; pill: string }> = {
  green: {
    block: 'bg-emerald-50 text-emerald-700',
    accent: 'bg-emerald-500',
    border: 'border-emerald-400',
    pill: 'bg-emerald-500 text-white',
  },
  blue: {
    block: 'bg-sky-50 text-sky-700',
    accent: 'bg-sky-500',
    border: 'border-sky-400',
    pill: 'bg-sky-500 text-white',
  },
  yellow: {
    block: 'bg-amber-50 text-amber-700',
    accent: 'bg-amber-400',
    border: 'border-amber-400',
    pill: 'bg-amber-400 text-white',
  },
  orange: {
    block: 'bg-orange-50 text-orange-700',
    accent: 'bg-orange-500',
    border: 'border-orange-400',
    pill: 'bg-orange-500 text-white',
  },
  red: {
    block: 'bg-rose-50 text-rose-700',
    accent: 'bg-rose-500',
    border: 'border-rose-400',
    pill: 'bg-rose-500 text-white',
  },
  purple: {
    block: 'bg-violet-50 text-violet-700',
    accent: 'bg-violet-500',
    border: 'border-violet-400',
    pill: 'bg-violet-500 text-white',
  },
};

const WEEK_START_HOUR = 6;
const WEEK_END_HOUR = 22;
const WEEK_HOUR_HEIGHT = 72;
const DEFAULT_TRAINING_START_TIME = '07:00';
const DEFAULT_TRAINING_DURATION = 60;
const TRAINING_INTENSITIES: TrainingIntensity[] = ['green', 'blue', 'yellow', 'orange', 'red', 'purple'];

const isTrainingIntensity = (value: unknown): value is TrainingIntensity =>
  typeof value === 'string' && TRAINING_INTENSITIES.includes(value as TrainingIntensity);

const timeToMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return WEEK_START_HOUR * 60;

  return Number(match[1]) * 60 + Number(match[2]);
};

const minutesToTime = (value: number) => {
  const clamped = Math.min(Math.max(value, WEEK_START_HOUR * 60), WEEK_END_HOUR * 60 - 15);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

const normalizeTrainingTime = (startTime: unknown, durationMinutes: unknown) => {
  const rawStart = typeof startTime === 'string' ? timeToMinutes(startTime) : timeToMinutes(DEFAULT_TRAINING_START_TIME);
  const roundedStart = Math.round(rawStart / 15) * 15;
  const start = Math.min(Math.max(roundedStart, WEEK_START_HOUR * 60), WEEK_END_HOUR * 60 - 15);
  const rawDuration = typeof durationMinutes === 'number' && Number.isFinite(durationMinutes)
    ? durationMinutes
    : DEFAULT_TRAINING_DURATION;
  const roundedDuration = Math.max(15, Math.round(rawDuration / 15) * 15);
  const duration = Math.min(roundedDuration, WEEK_END_HOUR * 60 - start);

  return { startTime: minutesToTime(start), durationMinutes: duration };
};

const normalizeStoredTrainingPlan = (value: unknown): TrainingPlan | null => {
  if (!value || typeof value !== 'object') return null;

  const plan = value as Partial<TrainingPlan>;
  if (
    typeof plan.id !== 'string' ||
    typeof plan.title !== 'string' ||
    typeof plan.details !== 'string' ||
    typeof plan.completed !== 'boolean' ||
    !isTrainingIntensity(plan.intensity)
  ) {
    return null;
  }

  return {
    id: plan.id,
    title: plan.title,
    details: plan.details,
    completed: plan.completed,
    intensity: plan.intensity,
    ...normalizeTrainingTime(plan.startTime, plan.durationMinutes),
  };
};

type WeekPlanLayout = { left: number; width: number };

const getWeekPlanLayouts = (plans: TrainingPlan[]) => {
  const sorted = [...plans].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const layouts = new Map<string, WeekPlanLayout>();
  let cluster: TrainingPlan[] = [];
  let clusterEnd = -1;

  const layoutCluster = () => {
    if (cluster.length === 0) return;

    const laneEnds: number[] = [];
    const lanes = new Map<string, number>();
    cluster.forEach(plan => {
      const start = timeToMinutes(plan.startTime);
      const end = start + plan.durationMinutes;
      let lane = laneEnds.findIndex(laneEnd => laneEnd <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      lanes.set(plan.id, lane);
    });

    const laneCount = Math.max(laneEnds.length, 1);
    cluster.forEach(plan => {
      const lane = lanes.get(plan.id) ?? 0;
      layouts.set(plan.id, {
        left: (lane / laneCount) * 100,
        width: 100 / laneCount,
      });
    });
  };

  sorted.forEach(plan => {
    const start = timeToMinutes(plan.startTime);
    const end = start + plan.durationMinutes;
    if (cluster.length > 0 && start >= clusterEnd) {
      layoutCluster();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(plan);
    clusterEnd = Math.max(clusterEnd, end);
  });
  layoutCluster();

  return layouts;
};

const readStoredTrainingPlans = (): Record<string, TrainingPlan[]> => {
  if (typeof window === 'undefined') return {};

  try {
    const rawValue = window.localStorage.getItem(TRAINING_PLANS_STORAGE_KEY);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([dateKey, value]) => [
        dateKey,
        Array.isArray(value)
          ? value.map(normalizeStoredTrainingPlan).filter((plan): plan is TrainingPlan => plan !== null)
          : [],
      ])
    );
  } catch (error) {
    console.warn('Failed to read training plans from localStorage.', error);
    return {};
  }
};

const writeStoredTrainingPlans = (plans: Record<string, TrainingPlan[]>) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(TRAINING_PLANS_STORAGE_KEY, JSON.stringify(plans));
  } catch (error) {
    console.warn('Failed to persist training plans locally.', error);
  }
};

const createDefaultTrainingPlans = (baseDate: Date): Record<string, TrainingPlan[]> => {
  const currentMonthStart = startOfMonth(baseDate);

  return {
    [format(addDays(currentMonthStart, 1), 'yyyy-MM-dd')]: [
      {
        id: generateId(),
        title: 'Easy Run · 8 km · 5:45/km',
        details: '保持轻松心率，最后 1 km 放松慢跑。',
        intensity: 'green',
        completed: false,
        startTime: '07:00',
        durationMinutes: 60,
      },
    ],
    [format(addDays(currentMonthStart, 4), 'yyyy-MM-dd')]: [
      {
        id: generateId(),
        title: 'Interval · 10 km · 4:10/km',
        details: '2 km 热身，6 x 800m，间歇慢跑恢复。',
        intensity: 'red',
        completed: false,
        startTime: '18:00',
        durationMinutes: 90,
      },
    ],
    [format(addDays(currentMonthStart, 9), 'yyyy-MM-dd')]: [
      {
        id: generateId(),
        title: 'Tempo · 12 km · 4:40/km',
        details: '前后各 3 km 轻松，中间 6 km 节奏跑。',
        intensity: 'orange',
        completed: true,
        startTime: '07:00',
        durationMinutes: 75,
      },
      {
        id: generateId(),
        title: 'Easy Run · 5 km · 6:00/km',
        details: '晚间恢复跑，跑后拉伸 10 分钟。',
        intensity: 'green',
        completed: false,
        startTime: '18:30',
        durationMinutes: 45,
      },
    ],
    [format(addDays(currentMonthStart, 15), 'yyyy-MM-dd')]: [
      {
        id: generateId(),
        title: 'Long Run · 24 km · 5:20/km',
        details: '补给按比赛日模拟，每 40 分钟一次。',
        intensity: 'blue',
        completed: false,
        startTime: '06:30',
        durationMinutes: 150,
      },
    ],
  };
};

const readStoredCalendarMarkerColors = (): Record<string, CalendarMarkerColor> => {
  if (typeof window === 'undefined') return {};

  try {
    const rawValue = window.localStorage.getItem(CALENDAR_MARKER_STORAGE_KEY);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, color]) => isCalendarMarkerColor(color))
    ) as Record<string, CalendarMarkerColor>;
  } catch (error) {
    console.warn('Failed to read calendar marker colors from localStorage.', error);
    return {};
  }
};

const getStoredCalendarMarkerColor = (id: string) => readStoredCalendarMarkerColors()[id];

const storeCalendarMarkerColor = (id: string, color: CalendarMarkerColor) => {
  if (typeof window === 'undefined') return;

  try {
    const storedColors = readStoredCalendarMarkerColors();
    storedColors[id] = color;
    window.localStorage.setItem(CALENDAR_MARKER_STORAGE_KEY, JSON.stringify(storedColors));
  } catch (error) {
    console.warn('Failed to persist calendar marker color locally.', error);
  }
};

const hydrateModule = (row: any): Module => {
  const storedMarkerColor = isCalendarModuleId(row.id) ? getStoredCalendarMarkerColor(row.id) : undefined;

  return {
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    children: Array.isArray(row.children) ? row.children : [],
    calendarMarkerColor: isCalendarModuleId(row.id)
      ? normalizeCalendarMarkerColor(row.calendarMarkerColor ?? storedMarkerColor)
      : undefined,
  } as Module;
};

const isMissingCalendarMarkerColumnError = (error: unknown) => {
  const message = JSON.stringify(error).toLowerCase();
  return message.includes('calendarmarkercolor') && (message.includes('column') || message.includes('schema cache'));
};

const initialModules: Record<string, Module> = {
  'root': {
    id: 'root',
    title: 'Home',
    summary: 'Root module of the workspace',
    text: 'Welcome to your workspace. You can add text here, upload images, or create sub-modules.',
    images: [],
    parentId: null,
    children: [],
  }
};

interface AutoResizeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
}

const AutoResizeTextarea = ({ value, onChange, placeholder, className }: AutoResizeTextareaProps) => {
  const [localValue, setLocalValue] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const isComposingStr = useRef(false);
  const isFocused = useRef(false);
  const syncedValueRef = useRef(value);
  const submittedValueRef = useRef<string | null>(null);
  
  useEffect(() => {
    syncedValueRef.current = value;

    if (submittedValueRef.current === value) {
      submittedValueRef.current = null;
    }

    // While the textarea is being edited, prefer the local draft over remote echoes.
    if (
      !isComposingStr.current &&
      !isFocused.current &&
      submittedValueRef.current === null &&
      value !== localValue
    ) {
      setLocalValue(value);
    }
  }, [value, localValue]);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [localValue]);

  const commitValue = (nextValue: string) => {
    if (
      nextValue === syncedValueRef.current ||
      nextValue === submittedValueRef.current
    ) {
      return;
    }

    submittedValueRef.current = nextValue;
    onChange(nextValue);
  };

  useEffect(() => {
    if (isComposingStr.current || localValue === value) {
      return;
    }

    const handler = setTimeout(() => {
      if (!isComposingStr.current) {
        commitValue(localValue);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [localValue, value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
  };

  const handleCompositionStart = () => {
    isComposingStr.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingStr.current = false;
    setLocalValue((e.target as HTMLTextAreaElement).value);
  };

  return (
    <textarea
      ref={ref}
      value={localValue}
      onChange={handleChange}
      onFocus={() => {
        isFocused.current = true;
      }}
      onBlur={(e) => {
        isFocused.current = false;
        commitValue(e.target.value);
      }}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      placeholder={placeholder}
      className={className}
      rows={1}
    />
  );
};

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [modules, setModules] = useState<Record<string, Module>>({});
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string>('root');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  // View State
  const [currentView, setCurrentView] = useState<'map' | 'editor' | 'calendar'>('map');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
  const [trainingPlans, setTrainingPlans] = useState<Record<string, TrainingPlan[]>>({});
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);
  const [selectedCalendarTime, setSelectedCalendarTime] = useState(DEFAULT_TRAINING_START_TIME);


  const [panZoom, setPanZoom] = useState({ x: 50, y: 50, scale: 1 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [dragNode, setDragNode] = useState<{ id: string, dx: number, dy: number, startX: number, startY: number, hasDragged: boolean } | null>(null);
  const calendarMarkerPersistenceMode = useRef<'unknown' | 'database' | 'local'>('unknown');

  // 1. Handle Authentication
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
      setIsAuthReady(true);
    };
    initAuth();
  }, []);

  // 2. Test Connection
  useEffect(() => {
    if (!isAuthReady) return;
    async function testConnection() {
      try {
        await supabase.from('modules').select('*').limit(1);
      } catch (error) {
        console.error("Please check your Supabase configuration.", error);
      }
    }
    testConnection();
  }, [isAuthReady]);

  useEffect(() => {
    const storedPlans = readStoredTrainingPlans();

    if (Object.keys(storedPlans).length > 0) {
      setTrainingPlans(storedPlans);
      writeStoredTrainingPlans(storedPlans);
      return;
    }

    const seedPlans = createDefaultTrainingPlans(new Date());
    setTrainingPlans(seedPlans);
    writeStoredTrainingPlans(seedPlans);
  }, []);

  useEffect(() => {
    if (!selectedCalendarDate) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCalendarDateModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCalendarDate]);

  useEffect(() => {
    setUploadErrorMessage(null);
  }, [currentId]);

  // 3. Real-time Sync
  useEffect(() => {
    if (!isAuthReady) return;

    const fetchModules = async () => {
      const { data, error } = await supabase.from('modules').select('*');
      if (error) {
         console.error('Fetch error:', error);
         return;
      }
      
      const newModules: Record<string, Module> = {};
      if (data) {
        data.forEach((row: any) => {
          if (Object.prototype.hasOwnProperty.call(row, 'calendarMarkerColor')) {
            calendarMarkerPersistenceMode.current = 'database';
          }

          newModules[row.id] = hydrateModule(row);
        });
      }

      if (Object.keys(newModules).length === 0) {
        await supabase.from('modules').insert(initialModules.root);
        newModules['root'] = initialModules.root;
      }
      
      setModules(newModules);
      setIsLoading(false);
    };

    fetchModules();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'modules',
        },
        () => {
           fetchModules();
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [isAuthReady]);

  const currentModule = modules[currentId];
  const isCalendarModule = currentModule ? isCalendarModuleId(currentModule.id) : false;

  const getCalendarMarkerColor = (module?: Module) =>
    normalizeCalendarMarkerColor(module?.calendarMarkerColor);

  // Breadcrumbs
  const breadcrumbs = [];
  let curr: Module | null = currentModule;
  while (curr) {
    breadcrumbs.unshift({ id: curr.id, title: curr.title });
    curr = curr.parentId ? modules[curr.parentId] : null;
  }

  // --- Map Layout Algorithm ---
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 70;
  const HORIZONTAL_SPACING = 300;
  const VERTICAL_SPACING = 90;

  type LayoutNode = { id: string; title: string; depth: number; x: number; y: number; height: number };
  type LayoutEdge = { fromId: string; fromX: number; fromY: number; toId: string; toX: number; toY: number };

  const getSubtreeHeight = (id: string, mods: Record<string, Module>): number => {
    const info = mods[id];
    if (!info || info.children.length === 0) return VERTICAL_SPACING;
    let childrenHeight = 0;
    for (const childId of info.children) {
      childrenHeight += getSubtreeHeight(childId, mods);
    }
    return Math.max(childrenHeight, VERTICAL_SPACING);
  };

  const layoutNodes: LayoutNode[] = [];
  const layoutEdges: LayoutEdge[] = [];

  const calculateLayout = (id: string, depth: number, currentY: number) => {
    const info = modules[id];
    if (!info) return currentY;
    const subtreeHeight = getSubtreeHeight(id, modules);
    const y = currentY + subtreeHeight / 2 - NODE_HEIGHT / 2;
    const x = depth * HORIZONTAL_SPACING;

    layoutNodes.push({ id, title: info.title, depth, x, y, height: NODE_HEIGHT });

    let childY = currentY;
    for (const childId of info.children) {
      const childSubHeight = getSubtreeHeight(childId, modules);
      const childYCenter = childY + childSubHeight / 2 - NODE_HEIGHT / 2;
      const childX = (depth + 1) * HORIZONTAL_SPACING;

      layoutEdges.push({
        fromId: id,
        fromX: x + NODE_WIDTH,
        fromY: y + NODE_HEIGHT / 2,
        toId: childId,
        toX: childX,
        toY: childYCenter + NODE_HEIGHT / 2
      });

      calculateLayout(childId, depth + 1, childY);
      childY += childSubHeight;
    }
  };

  if (modules.root) {
    calculateLayout('root', 0, 0);
  }

  // Adjust initial map position
  useEffect(() => {
    if (currentView === 'map' && mapContainerRef.current && modules.root) {
      const rect = mapContainerRef.current.getBoundingClientRect();
      const treeHeight = getSubtreeHeight('root', modules);
      setPanZoom(prev => {
        if (prev.x === 50 && prev.y === 50) {
          return { x: Math.max(50, rect.width * 0.1), y: Math.max(50, rect.height / 2 - treeHeight / 2), scale: 1 };
        }
        return prev;
      });
    }
  }, [currentView, Object.keys(modules).length]);

  const handleMapPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.module-node') || (e.target as HTMLElement).closest('button')) return;
    setIsDraggingMap(true);
    setDragStart({ x: e.clientX - panZoom.x, y: e.clientY - panZoom.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMapPointerMove = (e: React.PointerEvent) => {
    if (isDraggingMap) {
      setPanZoom(prev => ({ ...prev, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
    }
  };

  const handleMapPointerUp = (e: React.PointerEvent) => {
    setIsDraggingMap(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleMapWheel = (e: React.WheelEvent) => {
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1;
    
    if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setPanZoom(prev => {
          const newScale = Math.min(Math.max(0.1, prev.scale * scaleAdjust), 3);
          const newX = mouseX - (mouseX - prev.x) * (newScale / prev.scale);
          const newY = mouseY - (mouseY - prev.y) * (newScale / prev.scale);
          return { x: newX, y: newY, scale: newScale };
        });
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragNode({ id, dx: 0, dy: 0, startX: e.clientX, startY: e.clientY, hasDragged: false });
  };

  const handleNodePointerMove = (e: React.PointerEvent) => {
    if (dragNode) {
      e.stopPropagation();
      const dx = (e.clientX - dragNode.startX) / panZoom.scale;
      const dy = (e.clientY - dragNode.startY) / panZoom.scale;
      const hasDragged = dragNode.hasDragged || Math.abs(dx) > 3 || Math.abs(dy) > 3;
      setDragNode(prev => prev ? { ...prev, dx, dy, hasDragged } : null);
    }
  };

  const handleNodePointerUp = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (dragNode && !dragNode.hasDragged) {
      navigateTo(id);
      setCurrentView('editor');
    }
    setDragNode(null);
  };

  const depthColors = [
    'bg-blue-600 text-white border-blue-700 hover:shadow-blue-500/30',
    'bg-indigo-600 text-white border-indigo-700 hover:shadow-indigo-500/30',
    'bg-violet-600 text-white border-violet-700 hover:shadow-violet-500/30',
    'bg-purple-600 text-white border-purple-700 hover:shadow-purple-500/30',
    'bg-fuchsia-600 text-white border-fuchsia-700 hover:shadow-fuchsia-500/30',
    'bg-pink-600 text-white border-pink-700 hover:shadow-pink-500/30'
  ];

  const navigateToCalendarDay = async (date: Date) => {
    const id = `cal_${format(date, 'yyyy-MM-dd')}`;
    if (!modules[id]) {
      const newModuleBase = {
        id,
        title: format(date, 'yyyy-MM-dd'),
        summary: '',
        text: '',
        images: [],
        parentId: null,
        children: [],
      };
      const newModule: Module = {
        ...newModuleBase,
        calendarMarkerColor: getStoredCalendarMarkerColor(id) ?? DEFAULT_CALENDAR_MARKER_COLOR,
      };
      // Optimistically update the state so navigation happens immediately
      setModules(prev => ({...prev, [id]: newModule}));
      setCurrentId(id);
      setIsEditingTitle(false);
      setCurrentView('editor');

      try {
        await supabase.from('modules').insert(newModuleBase);
      } catch (e) {
        console.error(e);
      }
    } else {
      setCurrentId(id);
      setIsEditingTitle(false);
      setCurrentView('editor');
    }
  };

  const navigateTo = (id: string) => {
    setCurrentId(id);
    setIsEditingTitle(false);
    setCurrentView('editor');
    
    // Auto-expand parents when navigating
    let parent = modules[id]?.parentId;
    if (parent) {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        let p = parent;
        while (p) {
          next.add(p);
          p = modules[p]?.parentId;
        }
        return next;
      });
    }
  };

  const addModule = async () => {
    const newId = generateId();
    const newModule: Module = {
      id: newId,
      title: 'New Module',
      summary: '',
      text: '',
      images: [],
      parentId: currentId,
      children: [],
    };

    try {
      await supabase.from('modules').insert(newModule);
      await supabase.from('modules').update({
        children: [...modules[currentId].children, newId]
      }).eq('id', currentId);
      
      setExpandedNodes(prev => new Set(prev).add(currentId));
    } catch (e) {
      handleSupabaseError(e, OperationType.WRITE, `modules/${newId}`);
    }
  };

  const deleteModule = async (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this module and all its contents?')) return;

    const getDescendants = (id: string, mods: Record<string, Module>): string[] => {
      let desc: string[] = [];
      const children = mods[id]?.children || [];
      for (const childId of children) {
        desc.push(childId);
        desc = desc.concat(getDescendants(childId, mods));
      }
      return desc;
    };

    const descendants = getDescendants(idToDelete, modules);
    const idsToRemove = [idToDelete, ...descendants];

    try {
      const parentId = modules[idToDelete].parentId;
      
      if (parentId && modules[parentId]) {
        await supabase.from('modules').update({
          children: modules[parentId].children.filter(id => id !== idToDelete)
        }).eq('id', parentId);
      }

      for (const id of idsToRemove) {
        const mod = modules[id];
        if (mod && mod.images.length > 0) {
          for (const imageUrl of mod.images) {
            try {
              if (imageUrl.includes('supabase.co')) {
                const pathMatches = imageUrl.match(/public\/images\/(.*)/);
                if(pathMatches && pathMatches[1]) {
                    const filePath = pathMatches[1];
                    await supabase.storage.from('images').remove([filePath]);
                }
              }
            } catch (err) {
              console.warn("Failed to delete image from storage:", imageUrl, err);
            }
          }
        }
        await supabase.from('modules').delete().eq('id', id);
      }

      if (idsToRemove.includes(currentId)) {
        setCurrentId('root');
      }
    } catch (e) {
      handleSupabaseError(e, OperationType.DELETE, `modules/${idToDelete}`);
    }
  };

  const updateText = async (text: string) => {
    try {
      await supabase.from('modules').update({ text }).eq('id', currentId);
    } catch (e) {
      handleSupabaseError(e, OperationType.WRITE, `modules/${currentId}`);      
    }
  };

  const updateSummary = async (summary: string) => {
    try {
      await supabase.from('modules').update({ summary }).eq('id', currentId);
    } catch (e) {
      handleSupabaseError(e, OperationType.WRITE, `modules/${currentId}`);      
    }
  };

  const closeCalendarDateModal = () => {
    setSelectedCalendarDate(null);
  };

  const toggleTrainingPlanCompletion = (dateKey: string, planId: string) => {
    const nextPlans = {
      ...trainingPlans,
      [dateKey]: (trainingPlans[dateKey] ?? []).map(plan =>
        plan.id === planId ? { ...plan, completed: !plan.completed } : plan
      ),
    };

    setTrainingPlans(nextPlans);
    writeStoredTrainingPlans(nextPlans);
  };

  const updateTrainingPlan = (
    dateKey: string,
    planId: string,
    field: 'title' | 'details' | 'intensity' | 'startTime' | 'durationMinutes',
    value: string | number
  ) => {
    const nextPlans = {
      ...trainingPlans,
      [dateKey]: (trainingPlans[dateKey] ?? []).map(plan => {
        if (plan.id !== planId) return plan;

        const updatedPlan = { ...plan, [field]: value } as TrainingPlan;
        if (field === 'startTime' || field === 'durationMinutes') {
          return {
            ...updatedPlan,
            ...normalizeTrainingTime(updatedPlan.startTime, updatedPlan.durationMinutes),
          };
        }
        return updatedPlan;
      }),
    };

    setTrainingPlans(nextPlans);
    writeStoredTrainingPlans(nextPlans);
  };

  const addTrainingPlan = (dateKey: string) => {
    const start = normalizeTrainingTime(selectedCalendarTime, DEFAULT_TRAINING_DURATION);
    const nextPlans = {
      ...trainingPlans,
      [dateKey]: [
        ...(trainingPlans[dateKey] ?? []),
        {
          id: generateId(),
          title: 'New Training',
          details: '',
          intensity: 'green' as TrainingIntensity,
          completed: false,
          ...start,
        },
      ],
    };

    setTrainingPlans(nextPlans);
    writeStoredTrainingPlans(nextPlans);
  };

  const deleteTrainingPlan = (dateKey: string, planId: string) => {
    const nextDayPlans = (trainingPlans[dateKey] ?? []).filter(plan => plan.id !== planId);
    const nextPlans = {
      ...trainingPlans,
      [dateKey]: nextDayPlans,
    };

    setTrainingPlans(nextPlans);
    writeStoredTrainingPlans(nextPlans);
  };

  const openCalendarDateSidebar = (date: Date, time = DEFAULT_TRAINING_START_TIME) => {
    setSelectedCalendarDate(date);
    setSelectedCalendarTime(time);
  };

  const updateCalendarMarkerColor = async (color: CalendarMarkerColor) => {
    if (!isCalendarModuleId(currentId)) return;

    setModules(prev => {
      const current = prev[currentId];
      if (!current) return prev;

      return {
        ...prev,
        [currentId]: {
          ...current,
          calendarMarkerColor: color,
        }
      };
    });

    storeCalendarMarkerColor(currentId, color);

    if (calendarMarkerPersistenceMode.current === 'local') {
      return;
    }

    const { error } = await supabase
      .from('modules')
      .update({ calendarMarkerColor: color })
      .eq('id', currentId);

    if (!error) {
      calendarMarkerPersistenceMode.current = 'database';
      return;
    }

    if (isMissingCalendarMarkerColumnError(error)) {
      calendarMarkerPersistenceMode.current = 'local';
      console.warn('Supabase modules table does not have calendarMarkerColor yet. Falling back to localStorage.');
      return;
    }

    handleSupabaseError(error, OperationType.WRITE, `modules/${currentId}`);
  };

  const handleTitleEditSave = async () => {
    if (editTitleValue.trim()) {
      try {
        await supabase.from('modules').update({ title: editTitleValue.trim() }).eq('id', currentId);
      } catch (e) {
        handleSupabaseError(e, OperationType.WRITE, `modules/${currentId}`);    
      }
    }
    setIsEditingTitle(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadErrorMessage(null);
    setIsUploading(true);
    setUploadProgress(0);
    const newImageUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Check for file size (10MB) before starting upload to fail fast
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`File ${file.name} is too large (max 10MB)`);
        }

        const fileName = createSafeUploadFileName(currentId, file.name);

        const { data, error } = await supabase.storage.from('images').upload(fileName, file);
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);
        newImageUrls.push(publicUrl);
        setUploadProgress((i + 1) / files.length * 100);
      }

      await supabase.from('modules').update({
        images: [...modules[currentId].images, ...newImageUrls]
      }).eq('id', currentId);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      console.error('Image upload failed:', errorMessage, e);
      setUploadErrorMessage(`上传失败：${errorMessage}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const removeImage = async (indexToRemove: number) => {
    const imageUrl = modules[currentId].images[indexToRemove];
    try {
      // Delete from Storage if it's a Firebase Storage URL
      if (imageUrl.includes('supabase.co')) {
        const pathMatches = imageUrl.match(/public\/images\/(.*)/);
        if(pathMatches && pathMatches[1]) {
          const filePath = pathMatches[1];
          await supabase.storage.from('images').remove([filePath]);
        }
      }

      await supabase.from('modules').update({
        images: modules[currentId].images.filter((_, i) => i !== indexToRemove)
      }).eq('id', currentId);
    } catch (e) {
      handleSupabaseError(e, OperationType.WRITE, `modules/${currentId}`);
    }
  };

  // Recursive Tree Node Component
  const TreeNode: React.FC<{ id: string, depth?: number }> = ({ id, depth = 0 }) => {
    const mod = modules[id];
    if (!mod) return null;
    const isExpanded = expandedNodes.has(id);
    const isCurrent = currentId === id;
    const hasChildren = mod.children.length > 0;

    const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedNodes(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    return (
      <div>
        <div 
          className={`flex items-center py-1.5 px-2 cursor-pointer transition-colors ${isCurrent ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-200'}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => navigateTo(id)}
        >
          <div onClick={hasChildren ? toggleExpand : undefined} className={`w-4 h-4 mr-1 flex items-center justify-center ${hasChildren ? 'cursor-pointer hover:bg-gray-300 rounded' : ''}`}>
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            ) : <span className="w-3.5 h-3.5" />}
          </div>
          <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${isCurrent ? 'text-blue-600' : 'text-gray-400'}`} />
          <span className="text-sm truncate select-none">{mod.title}</span>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {mod.children.map(childId => <TreeNode key={childId} id={childId} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentCalendarMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const selectedDateKey = selectedCalendarDate ? format(selectedCalendarDate, 'yyyy-MM-dd') : null;
    const selectedDatePlans = selectedDateKey ? trainingPlans[selectedDateKey] ?? [] : [];

    const dateFormat = "yyyy-MM-dd";
    const rows = [];

    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        const isCurrentMonth = isSameMonth(day, monthStart);
        const dayPlans = trainingPlans[formattedDate] ?? [];
        const visiblePlans = dayPlans.slice(0, 2);
        const hiddenPlanCount = Math.max(dayPlans.length - visiblePlans.length, 0);
        const isToday = isSameDay(day, new Date());
        const isSelectedDate = selectedCalendarDate ? isSameDay(day, selectedCalendarDate) : false;
        const completedPlans = dayPlans.filter(plan => plan.completed).length;
        const hasTraining = dayPlans.length > 0;

        days.push(
          <div
            key={day.toISOString()}
            onClick={() => openCalendarDateSidebar(cloneDay)}
            className={`relative min-h-[138px] cursor-pointer border-b border-r border-[#edf0f5] p-3 text-left transition-colors hover:bg-[#f8faff] sm:min-h-[154px] sm:p-4 ${
              isCurrentMonth ? 'bg-white' : 'bg-[#fbfcfe] text-slate-300'
            } ${hasTraining && isCurrentMonth ? 'bg-[#fbfdff]' : ''} ${
              isSelectedDate ? 'z-10 shadow-[inset_0_0_0_2px_#2563eb]' : ''
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase text-[#a6b1c8]">
                  {hasTraining && isCurrentMonth ? `${completedPlans}/${dayPlans.length}` : '\u00A0'}
                </span>
                <span className={`text-xs ${isToday ? 'font-bold text-red-500' : 'font-semibold text-[#8290ad]'}`}>
                  {format(day, 'd')}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {visiblePlans.map(plan => {
                  const style = TRAINING_INTENSITY_STYLES[plan.intensity];

                  return (
                  <div key={plan.id} className={`rounded-md border-2 px-2.5 py-2 ${style.block} ${style.border} ${plan.completed ? 'opacity-60' : ''}`}>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${style.pill}`}>
                      {plan.completed ? 'Done' : 'Plan'}
                    </span>
                    <p className={`mt-1.5 truncate text-[11px] font-semibold ${plan.completed ? 'line-through' : ''}`}>
                      {plan.title || 'Untitled training'}
                    </p>
                  </div>
                  );
                })}

                {hiddenPlanCount > 0 && (
                  <div className="px-1 text-[10px] font-semibold text-[#8290ad]">
                    +{hiddenPlanCount} more
                  </div>
                )}

              </div>
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <React.Fragment key={day.toISOString()}>
          {days}
        </React.Fragment>
      );
      days = [];
    }

    const viewOptions: Array<{ value: 'map' | 'editor' | 'calendar'; label: string }> = [
      { value: 'map', label: 'Map' },
      { value: 'editor', label: 'Explorer' },
      { value: 'calendar', label: 'Calendar' },
    ];
    const weekStart = startOfWeek(currentCalendarMonth, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentCalendarMonth, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const weekHours = Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR }, (_, index) => WEEK_START_HOUR + index);
    const weekHeight = weekHours.length * WEEK_HOUR_HEIGHT;
    const currentYear = currentCalendarMonth.getFullYear();
    const yearMonths = Array.from({ length: 12 }, (_, index) => new Date(currentYear, index, 1));

    const weekTitle = weekStart.getFullYear() !== weekEnd.getFullYear()
      ? `${format(weekStart, 'MMMM d, yyyy')} – ${format(weekEnd, 'MMMM d, yyyy')}`
      : weekStart.getMonth() === weekEnd.getMonth()
        ? `${format(weekStart, 'MMMM d')} – ${format(weekEnd, 'd, yyyy')}`
        : `${format(weekStart, 'MMMM d')} – ${format(weekEnd, 'MMMM d, yyyy')}`;
    const calendarTitle = calendarMode === 'year'
      ? String(currentYear)
      : calendarMode === 'week'
        ? weekTitle
        : format(currentCalendarMonth, 'MMMM yyyy');

    const navigateCalendar = (direction: -1 | 1) => {
      setSelectedCalendarDate(null);
      setCurrentCalendarMonth(current => {
        if (calendarMode === 'year') return direction === 1 ? addYears(current, 1) : subYears(current, 1);
        if (calendarMode === 'week') return direction === 1 ? addWeeks(current, 1) : subWeeks(current, 1);
        return direction === 1 ? addMonths(current, 1) : subMonths(current, 1);
      });
    };

    const renderMonthView = () => (
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-[#edf0f5] bg-white">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(weekDay => (
            <div key={weekDay} className="border-r border-[#edf0f5] px-4 py-4 text-center text-[11px] font-semibold text-[#7182a3] last:border-r-0">
              {weekDay}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-l border-t border-[#edf0f5]">{rows}</div>
      </div>
    );

    const renderWeekView = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const showNowLine = isSameWeek(now, currentCalendarMonth, { weekStartsOn: 1 }) &&
        nowMinutes >= WEEK_START_HOUR * 60 && nowMinutes <= WEEK_END_HOUR * 60;
      const nowTop = ((nowMinutes - WEEK_START_HOUR * 60) / 60) * WEEK_HOUR_HEIGHT;

      return (
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[64px_repeat(7,minmax(110px,1fr))] border-b border-[#edf0f5] bg-white">
            <div className="grid place-items-center border-r border-[#edf0f5] text-[#a6b1c8]">
              <Calendar className="h-4 w-4" />
            </div>
            {weekDays.map(date => {
              const isToday = isSameDay(date, now);
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => openCalendarDateSidebar(date)}
                  className={`border-r border-[#edf0f5] px-3 py-3 text-center last:border-r-0 ${isToday ? 'bg-red-50/40' : ''}`}
                >
                  <span className={`text-xs font-semibold ${isToday ? 'text-red-500' : 'text-[#7182a3]'}`}>
                    {format(date, 'EEE d')}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex">
            <div className="relative w-16 shrink-0 border-r border-[#edf0f5] bg-white" style={{ height: weekHeight }}>
              {weekHours.map((hour, index) => (
                <span key={hour} className="absolute right-3 -translate-y-1/2 text-[10px] font-semibold text-[#a6b1c8]" style={{ top: index * WEEK_HOUR_HEIGHT }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            <div className="relative grid flex-1 grid-cols-7" style={{ height: weekHeight }}>
              {weekDays.map(date => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const dayPlans = trainingPlans[dateKey] ?? [];
                const layouts = getWeekPlanLayouts(dayPlans);

                return (
                  <div
                    key={dateKey}
                    className="relative border-r border-[#edf0f5] last:border-r-0"
                    style={{
                      backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${WEEK_HOUR_HEIGHT - 1}px, #edf0f5 ${WEEK_HOUR_HEIGHT - 1}px, #edf0f5 ${WEEK_HOUR_HEIGHT}px)`,
                    }}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offset = Math.min(Math.max(event.clientY - rect.top, 0), weekHeight - 1);
                      const minutes = WEEK_START_HOUR * 60 + Math.round((offset / WEEK_HOUR_HEIGHT) * 4) * 15;
                      openCalendarDateSidebar(date, minutesToTime(minutes));
                    }}
                  >
                    {dayPlans.map(plan => {
                      const style = TRAINING_INTENSITY_STYLES[plan.intensity];
                      const layout = layouts.get(plan.id) ?? { left: 0, width: 100 };
                      const startMinutes = timeToMinutes(plan.startTime);
                      const top = ((startMinutes - WEEK_START_HOUR * 60) / 60) * WEEK_HOUR_HEIGHT;
                      const height = Math.max((plan.durationMinutes / 60) * WEEK_HOUR_HEIGHT, 24);

                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCalendarDateSidebar(date, plan.startTime);
                          }}
                          className={`absolute z-10 overflow-hidden rounded-md border-2 px-2 py-1.5 text-left ${style.block} ${style.border} ${plan.completed ? 'opacity-60' : ''}`}
                          style={{
                            top,
                            height,
                            left: `calc(${layout.left}% + 4px)`,
                            width: `calc(${layout.width}% - 8px)`,
                          }}
                          title={`${plan.startTime} · ${plan.durationMinutes} min · ${plan.title}`}
                        >
                          <span className={`inline-flex rounded px-1 py-0.5 text-[8px] font-bold ${style.pill}`}>{plan.startTime}</span>
                          <p className={`mt-1 line-clamp-2 text-[10px] font-semibold ${plan.completed ? 'line-through' : ''}`}>{plan.title}</p>
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {showNowLine && (
                <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500" style={{ top: nowTop }}>
                  <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    const renderYearView = () => (
      <div className="grid grid-cols-1 gap-px bg-[#edf0f5] sm:grid-cols-2 xl:grid-cols-4">
        {yearMonths.map(month => {
          const miniStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
          const miniEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
          const miniDays: Date[] = [];
          let miniDay = miniStart;
          while (miniDay <= miniEnd) {
            miniDays.push(miniDay);
            miniDay = addDays(miniDay, 1);
          }
          const monthPrefix = format(month, 'yyyy-MM');
          const monthPlans = Object.entries(trainingPlans)
            .filter(([dateKey]) => dateKey.startsWith(monthPrefix))
            .flatMap(([, plans]) => plans);
          const completedCount = monthPlans.filter(plan => plan.completed).length;
          const completionRate = monthPlans.length > 0 ? Math.round((completedCount / monthPlans.length) * 100) : 0;

          return (
            <section key={monthPrefix} className="min-h-[270px] bg-white p-5">
              <button
                type="button"
                onClick={() => {
                  setCurrentCalendarMonth(month);
                  setCalendarMode('month');
                  setSelectedCalendarDate(null);
                }}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm font-semibold text-[#526d9f]">{format(month, 'MMMM')}</span>
                <span className="text-[10px] font-semibold text-[#a6b1c8]">{monthPlans.length} plans · {completionRate}%</span>
              </button>

              <div className="mt-4 grid grid-cols-7 text-center text-[9px] font-semibold text-[#a6b1c8]">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-y-1">
                {miniDays.map(date => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const plans = trainingPlans[dateKey] ?? [];
                  const inMonth = isSameMonth(date, month);
                  const isToday = isSameDay(date, new Date());
                  const isSelected = selectedCalendarDate ? isSameDay(date, selectedCalendarDate) : false;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={!inMonth}
                      onClick={() => {
                        setCurrentCalendarMonth(date);
                        setCalendarMode('month');
                        openCalendarDateSidebar(date);
                      }}
                      className={`relative mx-auto grid h-7 w-7 place-items-center rounded text-[10px] ${
                        !inMonth ? 'invisible' : isToday ? 'font-bold text-red-500' : 'font-medium text-[#7182a3]'
                      } ${isSelected ? 'ring-2 ring-blue-500' : 'hover:bg-[#f5f7fb]'}`}
                    >
                      {format(date, 'd')}
                      {plans.length > 0 && (
                        <span className="absolute bottom-0.5 flex gap-0.5">
                          {plans.slice(0, 2).map(plan => (
                            <span key={plan.id} className={`h-1 w-1 rounded-full ${TRAINING_INTENSITY_STYLES[plan.intensity].accent}`} />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );

    return (
      <div className="h-screen overflow-hidden bg-[#edf0f5] p-3 font-sans text-[#344361] sm:p-5 lg:p-7">
        <div className="mx-auto flex h-full max-w-[1600px] gap-4">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_18px_50px_rgba(74,91,127,0.10)]">
            <h1 className="sr-only">Running planner calendar</h1>
            <header className="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 border-b border-[#edf0f5] px-2 py-3 sm:min-h-[92px] sm:gap-4 sm:px-5 sm:py-4 lg:px-7">
              <div className="flex min-w-0 justify-start">
                <div className="inline-flex h-9 min-w-0 items-center rounded-full border border-[#edf0f5] bg-white p-0.5 shadow-[0_3px_12px_rgba(74,91,127,0.08)] sm:h-10 sm:p-1">
                  {(['year', 'week', 'month'] as CalendarMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setCalendarMode(mode);
                      }}
                      className={`h-8 rounded-full px-1 text-[9px] font-semibold transition-colors sm:px-3 sm:text-xs xl:px-4 ${
                        calendarMode === mode ? 'bg-[#526d9f] text-white' : 'text-[#a6b1c8] hover:text-[#526d9f]'
                      }`}
                    >
                      {mode[0].toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-center gap-1 sm:gap-4">
                <button type="button" onClick={() => navigateCalendar(-1)} className="grid h-8 w-8 place-items-center rounded-full border border-[#edf0f5] text-[#a6b1c8] shadow-[0_3px_12px_rgba(74,91,127,0.08)] transition hover:text-[#526d9f] sm:h-10 sm:w-10" title={`Previous ${calendarMode}`}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="w-20 truncate text-center text-[10px] font-semibold text-[#526d9f] sm:w-40 sm:text-sm" title={calendarTitle}>{calendarTitle}</span>
                <button type="button" onClick={() => navigateCalendar(1)} className="grid h-8 w-8 place-items-center rounded-full border border-[#edf0f5] text-[#a6b1c8] shadow-[0_3px_12px_rgba(74,91,127,0.08)] transition hover:text-[#526d9f] sm:h-10 sm:w-10" title={`Next ${calendarMode}`}>
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex min-w-0 justify-end">
                <div className="inline-flex h-9 min-w-0 items-center rounded-full border border-[#edf0f5] bg-white p-0.5 shadow-[0_3px_12px_rgba(74,91,127,0.08)] sm:h-10 sm:p-1">
                  {viewOptions.map(option => {
                    const isActive = currentView === option.value;
                    return (
                      <button key={option.value} type="button" onClick={() => setCurrentView(option.value)} className={`flex h-8 items-center justify-center rounded-full px-1.5 text-[9px] font-semibold transition-colors sm:px-3 sm:text-xs ${isActive ? 'bg-[#526d9f] text-white' : 'text-[#a6b1c8] hover:text-[#526d9f]'}`}>
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            <main className="flex-1 overflow-auto">
              {calendarMode === 'year' ? renderYearView() : calendarMode === 'week' ? renderWeekView() : renderMonthView()}
            </main>
          </section>

          {selectedCalendarDate && (
          <aside className="fixed inset-x-3 bottom-3 z-50 max-h-[78vh] overflow-hidden rounded-xl bg-white shadow-[0_20px_60px_rgba(45,61,96,0.22)] sm:inset-x-auto sm:right-5 sm:w-[390px] lg:static lg:max-h-none lg:w-[390px] lg:flex-none">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-[#edf0f5] px-5 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#a6b1c8]">Training day</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#344361]">
                    {format(selectedCalendarDate, 'MMMM d, yyyy')}
                  </h2>
                  <p className="mt-1 text-xs text-[#8290ad]">
                    {selectedDatePlans.length > 0 ? `${selectedDatePlans.length} training item${selectedDatePlans.length > 1 ? 's' : ''}` : 'Rest day'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCalendarDateModal}
                  className="grid h-8 w-8 place-items-center rounded-full text-[#a6b1c8] transition hover:bg-[#f5f7fb] hover:text-[#526d9f]"
                  title="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between border-b border-[#edf0f5] px-5 py-3">
                <p className="text-xs font-medium text-[#8290ad]">标题显示在日历，内容保留在侧栏</p>
                <button
                  type="button"
                  onClick={() => selectedDateKey && addTrainingPlan(selectedDateKey)}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-[#526d9f] px-3 text-xs font-semibold text-white transition hover:bg-[#405b8d]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {calendarMode === 'week' ? `新增 ${selectedCalendarTime}` : '新增'}
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {selectedDatePlans.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[#dfe4ed] bg-[#fbfcfe] px-4 py-8 text-center text-sm text-[#8290ad]">
                    今天是休息日，可以安排拉伸、泡沫轴或完全恢复。
                  </div>
                )}

                {selectedDatePlans.map(plan => {
                  const style = TRAINING_INTENSITY_STYLES[plan.intensity];

                  return (
                    <section key={plan.id} className={`rounded-lg border-2 bg-white p-4 ${style.border}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={`inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase ${style.pill}`}>{plan.intensity}</span>
                        <button
                          type="button"
                          onClick={() => toggleTrainingPlanCompletion(selectedDateKey!, plan.id)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            plan.completed
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-[#f5f7fb] text-[#7182a3]'
                          }`}
                        >
                          {plan.completed ? '已完成' : '标记完成'}
                        </button>
                      </div>

                      <div className="mt-4">
                        <label className="mb-1.5 block text-[10px] font-bold uppercase text-[#a6b1c8]">
                          标题
                        </label>
                        <input
                          type="text"
                          value={plan.title}
                          onChange={(e) => updateTrainingPlan(selectedDateKey!, plan.id, 'title', e.target.value)}
                          placeholder="例如：Easy Run · 8 km · 5:45/km"
                          className="w-full border-0 border-b border-[#dfe4ed] bg-transparent px-0 py-2 text-sm font-semibold text-[#344361] outline-none transition focus:border-[#526d9f]"
                        />
                      </div>

                      <div className="mt-4">
                        <label className="mb-1.5 block text-[10px] font-bold uppercase text-[#a6b1c8]">
                          具体内容
                        </label>
                        <textarea
                          value={plan.details}
                          onChange={(e) => updateTrainingPlan(selectedDateKey!, plan.id, 'details', e.target.value)}
                          placeholder="这里只出现在右侧栏，例如训练说明、补给计划、恢复要求等"
                          className="min-h-[90px] w-full resize-none rounded-md border border-[#dfe4ed] bg-[#fbfcfe] px-3 py-2 text-sm leading-6 text-[#52617e] outline-none transition focus:border-[#829bd0]"
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-bold uppercase text-[#a6b1c8]">开始时间</span>
                          <input
                            type="time"
                            min="06:00"
                            max="21:45"
                            step={900}
                            value={plan.startTime}
                            onChange={(event) => updateTrainingPlan(selectedDateKey!, plan.id, 'startTime', event.target.value)}
                            className="w-full rounded-md border border-[#dfe4ed] bg-[#fbfcfe] px-3 py-2 text-sm font-semibold text-[#52617e] outline-none transition focus:border-[#829bd0]"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-[10px] font-bold uppercase text-[#a6b1c8]">时长（分钟）</span>
                          <input
                            type="number"
                            min={15}
                            max={WEEK_END_HOUR * 60 - timeToMinutes(plan.startTime)}
                            step={15}
                            value={plan.durationMinutes}
                            onChange={(event) => updateTrainingPlan(selectedDateKey!, plan.id, 'durationMinutes', Number(event.target.value))}
                            className="w-full rounded-md border border-[#dfe4ed] bg-[#fbfcfe] px-3 py-2 text-sm font-semibold text-[#52617e] outline-none transition focus:border-[#829bd0]"
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-[10px] font-medium text-[#a6b1c8]">
                        {plan.startTime} – {minutesToTime(timeToMinutes(plan.startTime) + plan.durationMinutes)}
                      </p>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold uppercase text-[#a6b1c8]">强度颜色</span>
                        <div className="flex items-center gap-2">
                          {(['green', 'blue', 'yellow', 'orange', 'red', 'purple'] as TrainingIntensity[]).map(intensity => {
                            const intensityStyle = TRAINING_INTENSITY_STYLES[intensity];
                            const isActive = plan.intensity === intensity;

                            return (
                              <button
                                key={intensity}
                                type="button"
                                onClick={() => updateTrainingPlan(selectedDateKey!, plan.id, 'intensity', intensity)}
                                className={`h-5 w-5 rounded-full ${intensityStyle.accent} ${isActive ? 'ring-2 ring-[#526d9f] ring-offset-2' : 'opacity-70 hover:opacity-100'}`}
                                title={`${intensity} intensity`}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => deleteTrainingPlan(selectedDateKey!, plan.id)}
                          className="grid h-8 w-8 place-items-center rounded-md text-[#a6b1c8] transition-colors hover:bg-rose-50 hover:text-rose-600"
                          title="删除事项"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>

            </div>
          </aside>
        )}
      </div>
      </div>
    );
  };

  if (!isAuthReady || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (currentView === 'calendar') return renderCalendar();

  if (currentView === 'map' && modules.root) {
    return (
      <div className="h-screen overflow-hidden bg-[#edf0f5] p-3 font-sans text-slate-900 sm:p-5 lg:p-7">
        <div className="flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_18px_50px_rgba(74,91,127,0.10)]">
        <header className="z-10 flex min-h-[76px] flex-shrink-0 items-center justify-between border-b border-[#edf0f5] bg-white px-2 sm:min-h-[92px] sm:px-5 lg:px-7">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Network className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-bold">Workspace Map</h1>
              <p className="text-xs text-slate-500 mt-0.5">Drag to pan, scroll to zoom. Click a node to enter the editor.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center rounded-full border border-[#edf0f5] bg-white p-1 shadow-[0_3px_12px_rgba(74,91,127,0.08)]">
              <button onClick={() => setPanZoom(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }))} className="grid h-8 w-8 place-items-center rounded-full text-[#a6b1c8] transition-colors hover:bg-[#f1f5ff] hover:text-[#526d9f]" title="Zoom In"><ZoomIn className="w-4 h-4" /></button>
              <button onClick={() => setPanZoom(prev => ({ ...prev, scale: Math.max(prev.scale * 0.8, 0.1) }))} className="grid h-8 w-8 place-items-center rounded-full text-[#a6b1c8] transition-colors hover:bg-[#f1f5ff] hover:text-[#526d9f]" title="Zoom Out"><ZoomOut className="w-4 h-4" /></button>
              <button onClick={() => setPanZoom(prev => {
                if (mapContainerRef.current) {
                  const rect = mapContainerRef.current.getBoundingClientRect();
                  const treeHeight = getSubtreeHeight('root', modules);
                  return { x: Math.max(50, rect.width * 0.1), y: Math.max(50, rect.height / 2 - treeHeight / 2), scale: 1 };
                }
                return { x: 50, y: 50, scale: 1 };
              })} className="grid h-8 w-8 place-items-center rounded-full text-[#a6b1c8] transition-colors hover:bg-[#f1f5ff] hover:text-[#526d9f]" title="Reset View"><Maximize className="w-4 h-4" /></button>
            </div>
            <div className="inline-flex h-10 shrink-0 items-center rounded-full border border-[#edf0f5] bg-white p-1 shadow-[0_3px_12px_rgba(74,91,127,0.08)]">
              {([
                { value: 'map', label: 'Map' },
                { value: 'editor', label: 'Explorer' },
                { value: 'calendar', label: 'Calendar' },
              ] as const).map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCurrentView(option.value)}
                  className={`flex h-8 items-center justify-center rounded-full px-2 text-[10px] font-semibold transition-colors sm:px-3 sm:text-xs ${
                    currentView === option.value
                      ? 'bg-[#526d9f] text-white'
                      : 'text-[#a6b1c8] hover:text-[#526d9f]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main 
          ref={mapContainerRef}
          className={`flex-1 relative overflow-hidden bg-slate-50 ${isDraggingMap ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={handleMapPointerUp}
          onPointerLeave={handleMapPointerUp}
          onWheel={handleMapWheel}
        >
          {/* Background dots for aesthetics */}
          <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(#cbd5e1 2px, transparent 2px)', backgroundSize: `${30 * panZoom.scale}px ${30 * panZoom.scale}px`, backgroundPosition: `${panZoom.x}px ${panZoom.y}px` }} />

          <div 
            className="absolute origin-top-left will-change-transform"
            style={{ 
              transform: `translate(${panZoom.x}px, ${panZoom.y}px) scale(${panZoom.scale})` 
            }}
          >
            <svg className="absolute overflow-visible pointer-events-none">
              {layoutEdges.map((edge, idx) => {
                const fromIsDragged = dragNode?.id === edge.fromId;
                const toIsDragged = dragNode?.id === edge.toId;

                const startX = edge.fromX + (fromIsDragged ? dragNode.dx : 0);
                const startY = edge.fromY + (fromIsDragged ? dragNode.dy : 0);
                const endX = edge.toX + (toIsDragged ? dragNode.dx : 0);
                const endY = edge.toY + (toIsDragged ? dragNode.dy : 0);

                const cx1 = startX + (endX - startX) / 2;
                const cy1 = startY;
                const cx2 = cx1;
                const cy2 = endY;

                return (
                  <path
                    key={`edge-${idx}`}
                    d={`M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`}
                    strokeWidth="3.5"
                    stroke={fromIsDragged || toIsDragged ? "#93c5fd" : "#cbd5e1"}
                    fill="none"
                    style={{ transition: dragNode ? 'none' : 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                  />
                );
              })}
            </svg>

            {layoutNodes.map((node) => {
              const colorClass = depthColors[node.depth % depthColors.length];
              const isDragged = dragNode?.id === node.id;
              const dx = isDragged ? dragNode.dx : 0;
              const dy = isDragged ? dragNode.dy : 0;

              return (
                  <div
                    key={node.id}
                    className={`module-node absolute flex flex-col justify-center px-6 rounded-2xl border-2 shadow-lg cursor-pointer select-none ${colorClass} ${isDragged ? 'shadow-2xl ring-4 ring-white/50' : 'hover:shadow-xl'}`}
                    style={{ 
                      left: `${node.x}px`, 
                      top: `${node.y}px`,
                      width: `${NODE_WIDTH}px`, 
                      height: `${NODE_HEIGHT}px`,
                      zIndex: isDragged ? 50 : node.depth,
                      transform: `translate(${dx}px, ${dy}px) scale(${isDragged ? 1.05 : 1})`,
                      transition: dragNode ? 'none' : 'transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms'
                    }}
                    onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                    onPointerMove={handleNodePointerMove}
                    onPointerUp={(e) => handleNodePointerUp(e, node.id)}
                  >
                    <div className="font-bold text-[16px] truncate text-center">{node.title}</div>
                  </div>
              );
            })}
          </div>
        </main>
        </div>
      </div>
    );
  }

  if (!currentModule) {
    return (
      <div className="p-8 text-center">
        Module not found. 
        <button onClick={() => setCurrentId('root')} className="text-blue-500 underline ml-2">Go Home</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 overflow-hidden">
      
      {/* Left Sidebar Tree View */}
      <aside className="w-64 bg-[#f3f4f6] border-r border-gray-200 flex flex-col h-full flex-shrink-0">
        <div className="p-4 border-b border-gray-200 font-semibold text-gray-700 flex items-center text-sm uppercase tracking-wider">
          <Folder className="w-4 h-4 mr-2" /> Explorer
        </div>
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          <TreeNode id="root" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 h-full overflow-hidden bg-[#edf0f5] p-3 sm:p-5 lg:p-7">
        <div className="flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_18px_50px_rgba(74,91,127,0.10)]">
        {/* Top Navigation Bar */}
        <header className="z-10 flex min-h-[76px] flex-shrink-0 items-center border-b border-[#edf0f5] bg-white px-2 sm:min-h-[92px] sm:px-5 lg:px-7">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center overflow-x-auto no-scrollbar gap-1">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <button
                  onClick={() => navigateTo(crumb.id)}
                  className={`flex items-center whitespace-nowrap px-2 py-1.5 rounded-md transition-colors ${
                    index === breadcrumbs.length - 1 
                      ? 'text-gray-900 font-medium bg-gray-100' 
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {index === 0 ? <Home className="w-4 h-4 mr-1.5" /> : <Folder className="w-4 h-4 mr-1.5" />}
                  {crumb.title}
                </button>
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-gray-400 mx-1 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
            </div>

            <div className="ml-3 inline-flex h-10 shrink-0 items-center rounded-full border border-[#edf0f5] bg-white p-1 shadow-[0_3px_12px_rgba(74,91,127,0.08)]">
              {([
                { value: 'map', label: 'Map' },
                { value: 'editor', label: 'Explorer' },
                { value: 'calendar', label: 'Calendar' },
              ] as const).map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCurrentView(option.value)}
                  className={`flex h-8 items-center justify-center rounded-full px-2 text-[10px] font-semibold transition-colors sm:px-3 sm:text-xs ${
                    currentView === option.value
                      ? 'bg-[#526d9f] text-white'
                      : 'text-[#a6b1c8] hover:text-[#526d9f]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8 pb-32">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                {/* Title Section */}
                <div className="group flex items-center">
                  {isEditingTitle ? (
                    <input
                      autoFocus
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={handleTitleEditSave}
                      onKeyDown={(e) => e.key === 'Enter' && handleTitleEditSave()}
                      className="text-4xl font-bold bg-transparent border-b-2 border-blue-500 focus:outline-none w-full"
                    />
                  ) : (
                    <h1 
                      className="text-4xl font-bold cursor-pointer hover:text-gray-700 transition-colors flex items-center"
                      onClick={() => {
                        setEditTitleValue(currentModule.title);
                        setIsEditingTitle(true);
                      }}
                    >
                      {currentModule.title}
                      <Edit2 className="w-5 h-5 ml-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h1>
                  )}
                </div>

                {/* Summary Section */}
                {isCalendarModule && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Marker Color</label>
                    <div className="flex flex-wrap gap-3">
                      {CALENDAR_MARKER_OPTIONS.map(option => {
                        const isSelected = getCalendarMarkerColor(currentModule) === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateCalendarMarkerColor(option.value)}
                            className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                              isSelected
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            <span className="relative block h-6 w-6 overflow-hidden rounded-md border border-black/10 bg-slate-50">
                              <span
                                className="absolute inset-0"
                                style={{
                                  backgroundColor: option.hex,
                                  clipPath: 'polygon(0 0, 0 100%, 100% 100%)',
                                }}
                              />
                            </span>
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      The bottom-left triangle appears when the date has summary, text, or images.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Summary (简介)</label>
                  <AutoResizeTextarea
                    key={`summary-${currentId}`}
                    value={currentModule.summary}
                    onChange={updateSummary}
                    placeholder="Add a brief summary for this module..."
                    className="w-full resize-none bg-white border border-gray-200 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-700 shadow-sm transition-all"
                  />
                </div>

                {/* Detailed Content Section */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Detailed Content (具体内容)</label>
                  <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6">
                      <AutoResizeTextarea
                        key={`text-${currentId}`}
                        value={currentModule.text}
                        onChange={updateText}
                        placeholder="Write your detailed content here..."
                        className="w-full min-h-[150px] resize-none bg-transparent focus:outline-none text-gray-700 text-lg leading-relaxed"
                      />
                    </div>
                    
                    {/* Images Area */}
                    {currentModule.images.length > 0 && (
                      <div className="px-6 pb-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {currentModule.images.map((img, idx) => (
                          <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                            <img src={img} alt={`Module attachment ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                              onClick={() => removeImage(idx)}
                              className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Toolbar */}
                    <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center gap-4">
                      <label className={`flex items-center gap-2 text-sm font-medium transition-colors px-3 py-1.5 rounded-md ${isUploading ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:text-gray-900 cursor-pointer hover:bg-gray-200'}`}>
                        {isUploading ? (
                          <div className="flex items-center gap-2">
                             <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                             <span className="text-xs">{Math.round(uploadProgress)}%</span>
                          </div>
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                        {isUploading ? 'Uploading...' : 'Add Image'}
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={isUploading} />
                      </label>
                    </div>
                    {uploadErrorMessage && (
                      <div className="border-t border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
                        {uploadErrorMessage}
                      </div>
                    )}
                  </section>
                </div>

                {/* Sub-modules Section */}
                {!isCalendarModule && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                      <Folder className="w-4 h-4 text-blue-500" />
                      Sub-modules
                    </h2>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentModule.children.map(childId => {
                      const child = modules[childId];
                      if (!child) return null;
                      return (
                        <div
                          key={childId}
                          onClick={() => navigateTo(childId)}
                          className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex flex-col"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                              <Folder className="w-6 h-6" />
                            </div>
                            <button
                              onClick={(e) => deleteModule(childId, e)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                              title="Delete module"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <h3 className="font-semibold text-gray-900 mb-1 truncate">{child.title}</h3>
                          <p className="text-sm text-gray-500 line-clamp-2 flex-grow">
                            {child.summary || 'No summary'}
                          </p>
                          <div className="mt-4 flex items-center gap-3 text-xs text-gray-400 font-medium">
                            {child.children.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Folder className="w-3.5 h-3.5" /> {child.children.length}
                              </span>
                            )}
                            {child.images.length > 0 && (
                              <span className="flex items-center gap-1">
                                <ImageIcon className="w-3.5 h-3.5" /> {child.images.length}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add Module Button */}
                    <button
                      onClick={addModule}
                      className="bg-transparent border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[160px] transition-all group"
                    >
                      <div className="p-3 bg-gray-100 group-hover:bg-blue-100 rounded-full mb-3 transition-colors">
                        <Plus className="w-6 h-6" />
                      </div>
                      <span className="font-medium">Create Module</span>
                    </button>
                  </div>
                </section>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        </div>
      </div>
    </div>
  );
}
