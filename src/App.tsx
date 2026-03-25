/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Folder, FileText, Image as ImageIcon, Plus, ChevronRight, ChevronDown, Home, Trash2, Edit2, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, storage } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocFromServer,
  writeBatch
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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
};

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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const generateId = () => Math.random().toString(36).substring(2, 9);

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

const AutoResizeTextarea = ({ value, onChange, placeholder, className }: any) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
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
  const [currentId, setCurrentId] = useState<string>('root');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));

  // 1. Handle Authentication
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Anonymous sign-in failed", error);
        }
      } else {
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Test Connection
  useEffect(() => {
    if (!isAuthReady) return;
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'modules', 'root'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, [isAuthReady]);

  // 3. Real-time Sync
  useEffect(() => {
    if (!isAuthReady) return;

    const unsubscribe = onSnapshot(collection(db, 'modules'), (snapshot) => {
      const newModules: Record<string, Module> = {};
      snapshot.forEach((doc) => {
        newModules[doc.id] = doc.data() as Module;
      });

      // If root is missing, initialize it
      if (Object.keys(newModules).length === 0) {
        setDoc(doc(db, 'modules', 'root'), initialModules.root)
          .catch(e => handleFirestoreError(e, OperationType.WRITE, 'modules/root'));
      } else {
        setModules(newModules);
        setIsLoading(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'modules');
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const currentModule = modules[currentId];

  // Breadcrumbs
  const breadcrumbs = [];
  let curr: Module | null = currentModule;
  while (curr) {
    breadcrumbs.unshift({ id: curr.id, title: curr.title });
    curr = curr.parentId ? modules[curr.parentId] : null;
  }

  const navigateTo = (id: string) => {
    setCurrentId(id);
    setIsEditingTitle(false);
    
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
      const batch = writeBatch(db);
      batch.set(doc(db, 'modules', newId), newModule);
      batch.update(doc(db, 'modules', currentId), {
        children: [...modules[currentId].children, newId]
      });
      await batch.commit();
      setExpandedNodes(prev => new Set(prev).add(currentId));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `modules/${newId}`);
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
      const batch = writeBatch(db);
      const parentId = modules[idToDelete].parentId;
      
      if (parentId && modules[parentId]) {
        batch.update(doc(db, 'modules', parentId), {
          children: modules[parentId].children.filter(id => id !== idToDelete)
        });
      }

      // Delete images from Storage for all removed modules
      for (const id of idsToRemove) {
        const mod = modules[id];
        if (mod && mod.images.length > 0) {
          for (const imageUrl of mod.images) {
            try {
              // Only delete if it's a Firebase Storage URL
              if (imageUrl.includes('firebasestorage.googleapis.com')) {
                const imageRef = ref(storage, imageUrl);
                await deleteObject(imageRef);
              }
            } catch (err) {
              console.warn("Failed to delete image from storage:", imageUrl, err);
            }
          }
        }
        batch.delete(doc(db, 'modules', id));
      }

      await batch.commit();
      if (idsToRemove.includes(currentId)) {
        setCurrentId('root');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `modules/${idToDelete}`);
    }
  };

  const updateText = async (text: string) => {
    try {
      await setDoc(doc(db, 'modules', currentId), { ...modules[currentId], text });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `modules/${currentId}`);
    }
  };

  const updateSummary = async (summary: string) => {
    try {
      await setDoc(doc(db, 'modules', currentId), { ...modules[currentId], summary });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `modules/${currentId}`);
    }
  };

  const handleTitleEditSave = async () => {
    if (editTitleValue.trim()) {
      try {
        await setDoc(doc(db, 'modules', currentId), { ...modules[currentId], title: editTitleValue.trim() });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `modules/${currentId}`);
      }
    }
    setIsEditingTitle(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newImageUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${currentId}/${Date.now()}-${file.name}`;
        const imageRef = ref(storage, `images/${fileName}`);
        
        const snapshot = await uploadBytes(imageRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        newImageUrls.push(downloadUrl);
      }

      await setDoc(doc(db, 'modules', currentId), {
        ...modules[currentId],
        images: [...modules[currentId].images, ...newImageUrls]
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `modules/${currentId}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = async (indexToRemove: number) => {
    const imageUrl = modules[currentId].images[indexToRemove];
    try {
      // Delete from Storage if it's a Firebase Storage URL
      if (imageUrl.includes('firebasestorage.googleapis.com')) {
        const imageRef = ref(storage, imageUrl);
        await deleteObject(imageRef);
      }

      await setDoc(doc(db, 'modules', currentId), {
        ...modules[currentId],
        images: modules[currentId].images.filter((_, i) => i !== indexToRemove)
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `modules/${currentId}`);
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

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium">Connecting to workspace...</p>
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
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 sm:px-6 lg:px-8 flex-shrink-0">
          <div className="max-w-5xl mx-auto flex items-center overflow-x-auto no-scrollbar">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <button
                  onClick={() => navigateTo(crumb.id)}
                  className={`flex items-center whitespace-nowrap px-2 py-1 rounded-md transition-colors ${
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
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Summary (简介)</label>
                  <AutoResizeTextarea
                    value={currentModule.summary}
                    onChange={(e: any) => updateSummary(e.target.value)}
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
                        value={currentModule.text}
                        onChange={(e: any) => updateText(e.target.value)}
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
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
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

              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
