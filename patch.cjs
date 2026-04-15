const fs = require('fs');

let text = fs.readFileSync('src/App.tsx', 'utf-8');

text = text.replace(
  "import { Folder, FileText, Image as ImageIcon, Plus, ChevronRight, ChevronDown, Home, Trash2, Edit2, X, AlertCircle, Maximize, ZoomIn, ZoomOut, Network } from 'lucide-react';",
  "import { Folder, FileText, Image as ImageIcon, Plus, ChevronRight, ChevronDown, Home, Trash2, Edit2, X, AlertCircle, Maximize, ZoomIn, ZoomOut, Network, Calendar, ChevronLeft } from 'lucide-react';"
);

if (!text.includes("import { format")) {
  text = text.replace(
    "import { supabase } from './supabase';",
    "import { supabase } from './supabase';\nimport { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays } from 'date-fns';"
  );
}

text = text.replace(
  "const [showMapView, setShowMapView] = useState(true);",
  "const [currentView, setCurrentView] = useState<'map' | 'editor' | 'calendar'>('map');\n  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());"
);

text = text.split("if (showMapView && modules.root)").join("if (currentView === 'map' && modules.root)");
text = text.split("showMapView").join("(currentView === 'map')");
text = text.split("setShowMapView(false)").join("setCurrentView('editor')");
text = text.split("setShowMapView(true)").join("setCurrentView('map')");

const nav_logic = `  const navigateToCalendarDay = async (date: Date) => {
    const id = \`cal_\${format(date, 'yyyy-MM-dd')}\`;
    if (!modules[id]) {
      const newModule: Module = {
        id,
        title: format(date, 'yyyy-MM-dd'),
        summary: '',
        text: '',
        images: [],
        parentId: null,
        children: [],
      };
      try {
        await supabase.from('modules').insert(newModule);
      } catch (e) {
        console.error(e);
      }
    }
    setCurrentId(id);
    setIsEditingTitle(false);
    setCurrentView('editor');
  };

  const navigateTo = (id: string) => {
    setCurrentId(id);
    setIsEditingTitle(false);
    setCurrentView('editor');`;

text = text.replace(
  `  const navigateTo = (id: string) => {
    setCurrentId(id);
    setIsEditingTitle(false);`,
  nav_logic
);

const render_cal = `  const renderCalendar = () => {
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
        const moduleId = \`cal_\${formattedDate}\`;
        const hasSchedule = modules[moduleId] && (modules[moduleId].text.trim() !== '' || modules[moduleId].summary.trim() !== '' || modules[moduleId].images.length > 0);
        
        days.push(
          <div
            key={day.toISOString()}
            onClick={() => navigateToCalendarDay(cloneDay)}
            className={\`
              h-32 p-2 border-r border-b relative cursor-pointer hover:bg-slate-50 transition-colors
              \${!isSameMonth(day, monthStart) ? 'text-slate-300 bg-slate-50/50' : 'text-slate-700 bg-white'}
              \${hasSchedule ? 'bg-blue-50 hover:bg-blue-100' : ''}
            \`}
          >
             <span className={\`text-sm font-semibold \${isSameDay(day, new Date()) ? 'bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center' : ''}\`}>
                {format(day, 'd')}
             </span>
             {hasSchedule && <div className="absolute bottom-2 left-2 w-2 h-2 bg-blue-500 rounded-full"></div>}
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
               <button onClick={() => setCurrentCalendarMonth(addMonths(currentCalendarMonth, 1))} className="p-1.5 hover:bg-white rounded-md text-slate-600 transition-colors"><ChevronRight className="w-5 h-5" /></button>
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

  if (currentView === 'map' && modules.root) {`;

text = text.replace("if (currentView === 'map' && modules.root) {", render_cal);

const header_replacement_map = `              <button
              onClick={() => setCurrentView('editor')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Open Editor View
              </button>
              <button
              onClick={() => setCurrentView('calendar')}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors shadow-sm ml-2"
              >
                Open Calendar
              </button>`;

text = text.replace(
  `<button
              onClick={() => setCurrentView('editor')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                Open Editor View
              </button>`,
  header_replacement_map
);

const header_replacement_editor = `<button
              onClick={() => setCurrentView('map')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm ml-4 whitespace-nowrap"
            >
              <Network className="w-4 h-4" />
              Open Map View
            </button>
            <button
              onClick={() => setCurrentView('calendar')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm ml-2 whitespace-nowrap"
            >
              <Calendar className="w-4 h-4" />
              Open Calendar
            </button>`;

text = text.replace(
  `<button
              onClick={() => setCurrentView('map')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm ml-4 whitespace-nowrap"
            >
              <Network className="w-4 h-4" />
              Open Map View
            </button>`,
  header_replacement_editor
);

fs.writeFileSync('src/App.tsx', text);
console.log("Node replacement successful");