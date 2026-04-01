import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Imports
text = re.sub(
    r"import \{ db, auth, storage \} from '\.\/firebase';[\s\S]*?import \{ ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable \} from 'firebase\/storage';",
    "import { supabase } from './supabase';",
    text
)

# handleFirestoreError -> handleSupabaseError
text = re.sub(
    r"Firestore Error",
    "Supabase Error",
    text
)
text = re.sub(
    r"handleFirestoreError",
    "handleSupabaseError",
    text
)

# 1. Handle Authentication
text = re.sub(
    r"// 1\. Handle Authentication[\s\S]*?// 2\. Test Connection",
    """// 1. Handle Authentication
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

  // 2. Test Connection""",
    text
)

# 2. Test Connection
text = re.sub(
    r"// 2\. Test Connection[\s\S]*?// 3\. Real-time Sync",
    """// 2. Test Connection
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

  // 3. Real-time Sync""",
    text
)

# 3. Real-time Sync
text = re.sub(
    r"// 3\. Real-time Sync[\s\S]*?const currentModule = modules\[currentId\];",
    """// 3. Real-time Sync
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
          newModules[row.id] = row as Module;
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

  const currentModule = modules[currentId];""",
    text
)

# addModule
text = re.sub(
    r"const addModule = async \(\) => \{[\s\S]*?setExpandedNodes\(prev => new Set\(prev\)\.add\(currentId\)\);\n    \} catch \(e\) \{[\s\S]*?\}\n  \};",
    """const addModule = async () => {
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
  };""",
    text
)

# deleteModule
text = re.sub(
    r"const deleteModule = async \(idToDelete: string, e: React\.MouseEvent\) => \{[\s\S]*?handleSupabaseError\(e, OperationType\.DELETE, `modules/\$\{idToDelete\}`\);\n    \}\n  \};",
    """const deleteModule = async (idToDelete: string, e: React.MouseEvent) => {
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
  };""",
    text
)

# Text and Title Updates
text = re.sub(
    r"await setDoc\(doc\(db, 'modules', currentId\), \{ \.\.\.modules\[currentId\], (text|summary|title): ([^}]+) \}\);",
    r"await supabase.from('modules').update({ \1: \2 }).eq('id', currentId);",
    text
)

# Image Upload
text = re.sub(
    r"const uploadTask = uploadBytesResumable\(imageRef, file\);[\s\S]*?newImageUrls\.push\(downloadUrl\);\n      \}[\s\S]*?images: \[\.\.\.modules\[currentId\]\.images, \.\.\.newImageUrls\][\s\S]*?\}\);",
    """const { data, error } = await supabase.storage.from('images').upload(fileName, file);
        if (error) throw error;
        
        const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName);
        newImageUrls.push(publicUrl);
        setUploadProgress((i + 1) / files.length * 100);
      }

      await supabase.from('modules').update({
        images: [...modules[currentId].images, ...newImageUrls]
      }).eq('id', currentId);""",
    text
)

# Image remove
text = re.sub(
    r"if \(imageUrl\.includes\('firebasestorage\.googleapis\.com'\)\) \{[\s\S]*?await deleteObject\(imageRef\);\n      \}\n\n      await setDoc\(doc\(db, 'modules', currentId\), \{[\s\S]*?images: modules\[currentId\]\.images\.filter\(\(_, i\) => i !== indexToRemove\)[\s\S]*?\}\);",
    """if (imageUrl.includes('supabase.co')) {
        const pathMatches = imageUrl.match(/public\/images\/(.*)/);
        if(pathMatches && pathMatches[1]) {
          const filePath = pathMatches[1];
          await supabase.storage.from('images').remove([filePath]);
        }
      }

      await supabase.from('modules').update({
        images: modules[currentId].images.filter((_, i) => i !== indexToRemove)
      }).eq('id', currentId);""",
    text
)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
