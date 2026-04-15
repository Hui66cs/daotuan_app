/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Folder, FileText, Image as ImageIcon, Plus, ChevronRight, ChevronDown, Home, Trash2, Edit2, X, AlertCircle, Maximize, ZoomIn, ZoomOut, Network, Calendar, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './supabase';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays } from 'date-fns';

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

const generateId = () => Math.random().toString(36).substring(2, 9);

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
  const [currentId, setCurrentId] = useState<string>('root');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  // View State
  const [currentView, setCurrentView] = useState<'map' | 'editor' | 'calendar'>('map');
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());


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

        const fileName = `${currentId}/${Date.now()}-${file.name}`;

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
      handleSupabaseError(e, OperationType.WRITE, `modules/${currentId}`);
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
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const dateFormat = "yyyy-MM-dd";
    const rows = [];

    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        const moduleId = `cal_${formattedDate}`;
        const hasSchedule = modules[moduleId] && (modules[moduleId].text.trim() !== '' || modules[moduleId].summary.trim() !== '' || modules[moduleId].images.length > 0);
        const moduleSummary = modules[moduleId]?.summary?.trim();
        const markerColor = getCalendarMarkerColor(modules[moduleId]);
        const markerColorMeta = CALENDAR_MARKER_COLOR_MAP[markerColor];
        const isCurrentMonth = isSameMonth(day, monthStart);

        days.push(
          <div
            key={day.toISOString()}
            onClick={() => navigateToCalendarDay(cloneDay)}
            className={`
              flex-1 w-0 h-32 p-2 border-r border-b relative cursor-pointer transition-[background-color,filter] overflow-hidden hover:brightness-95
              ${!isCurrentMonth ? 'text-slate-300 bg-slate-50/50' : 'text-slate-700 bg-white'}
            `}
            style={hasSchedule ? { backgroundColor: markerColorMeta.cellBackground } : undefined}
          >
             <span className={`text-sm font-semibold mb-1 ${isSameDay(day, new Date()) ? 'bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center' : 'block'}`}>
                {format(day, 'd')}
             </span>
             {moduleSummary && (
               <div className="text-xs text-slate-600 line-clamp-3 mt-1 leading-relaxed whitespace-pre-line break-words">
                 {moduleSummary}
               </div>
             )}
             {hasSchedule && (
               <div
                 className="absolute bottom-0 left-0 h-5 w-5 pointer-events-none"
                 style={{
                   backgroundColor: markerColorMeta.hex,
                   clipPath: 'polygon(0 0, 0 100%, 100% 100%)',
                 }}
               />
             )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="flex w-full" key={day.toISOString()}>
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans overflow-hidden">
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur px-6 py-4 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><Calendar className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-bold">Calendar</h1>
              <p className="text-xs text-slate-500 mt-0.5">Manage your daily schedule.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
               <button onClick={() => setCurrentCalendarMonth(subMonths(currentCalendarMonth, 1))} className="p-1.5 hover:bg-white rounded-md text-slate-600 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
               <span className="px-4 font-semibold text-slate-700 w-32 text-center">{format(currentCalendarMonth, 'MMMM yyyy')}</span>
               <button onClick={() => setCurrentCalendarMonth(addMonths(currentCalendarMonth, 1))} className="p-1.5 hover:bg-white rounded-md text-slate-600 transition-colors"><ChevronRightIcon className="w-5 h-5" /></button>
            </div>

            <button
              onClick={() => setCurrentView('map')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              Open Map View
            </button>
             <button
              onClick={() => setCurrentView('editor')}
              className="px-5 py-2.5 rounded-xl bg-slate-600 text-white font-medium hover:bg-slate-700 transition-colors shadow-sm"
            >
              Open Explorer
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8">
           <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex bg-slate-50 border-b border-slate-200">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="flex-1 py-3 text-center text-sm font-semibold text-slate-500 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
              </div>
              <div className="flex flex-col">
                {rows}
              </div>
           </div>
        </main>
      </div>
    );
  };

  if (currentView === 'calendar') return renderCalendar();

  if (currentView === 'map' && modules.root) {
    return (
      <div className="h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans overflow-hidden">
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur px-6 py-4 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Network className="w-6 h-6" /></div>
            <div>
              <h1 className="text-xl font-bold">Workspace Map</h1>
              <p className="text-xs text-slate-500 mt-0.5">Drag to pan, scroll to zoom. Click a node to enter the editor.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
              <button onClick={() => setPanZoom(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }))} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors" title="Zoom In"><ZoomIn className="w-5 h-5" /></button>
              <button onClick={() => setPanZoom(prev => ({ ...prev, scale: Math.max(prev.scale * 0.8, 0.1) }))} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors" title="Zoom Out"><ZoomOut className="w-5 h-5" /></button>
              <button onClick={() => setPanZoom(prev => {
                if (mapContainerRef.current) {
                  const rect = mapContainerRef.current.getBoundingClientRect();
                  const treeHeight = getSubtreeHeight('root', modules);
                  return { x: Math.max(50, rect.width * 0.1), y: Math.max(50, rect.height / 2 - treeHeight / 2), scale: 1 };
                }
                return { x: 50, y: 50, scale: 1 };
              })} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg mr-4 transition-colors" title="Reset View"><Maximize className="w-5 h-5" /></button>
              <button
              onClick={() => setCurrentView('editor')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Open Editor View
              </button>
              <button
              onClick={() => setCurrentView('calendar')}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors shadow-sm ml-4"
              >
                Open Calendar
              </button>
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
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 sm:px-6 lg:px-8 flex-shrink-0">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
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

            <button
              onClick={() => setCurrentView('map')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm ml-4 whitespace-nowrap"
            >
              <Network className="w-4 h-4" />
              Open Map View
            </button>
            <button
              onClick={() => setCurrentView('calendar')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white border border-indigo-600 bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm ml-4 whitespace-nowrap"
            >
              <Calendar className="w-4 h-4" />
              Open Calendar
            </button>
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
  );
}
