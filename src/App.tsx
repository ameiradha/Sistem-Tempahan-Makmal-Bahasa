/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  LogOut, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  LayoutDashboard,
  Lock,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Settings as SettingsIcon,
  Image as ImageIcon,
  Menu,
  X,
  Pencil,
  Trash2,
  Users,
  Search,
  RotateCcw,
  Check,
  Ban,
  ShieldAlert,
  Info,
  Power
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isBefore,
  startOfToday,
  addDays
} from 'date-fns';

import { auth, db } from './lib/firebase';
import { cn } from './lib/utils';
import { UserProfile, Booking, BookingStatus, Lab, AppSettings, TIME_SLOTS, TEACHERS, CLASSES, PURPOSES, Teacher } from './types';

// --- Components ---

function Button({ 
  className, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-shadow',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
    danger: 'bg-rose-500 text-white hover:bg-rose-600',
    ghost: 'hover:bg-slate-100 text-slate-600',
    outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50'
  };
  
  const sizes = {
    sm: 'px-2.5 py-1 text-xs font-semibold',
    md: 'px-4 py-2 text-sm font-semibold',
    lg: 'px-6 py-2.5 text-base font-semibold',
    icon: 'p-1.5'
  };

  return (
    <button 
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none tracking-tight',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden', className)}>
      {children}
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'admin'>('dashboard');
  const [labs, setLabs] = useState<Lab[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    systemName: 'Sistem Tempahan Makmal Bahasa SKBJ',
    systemDescription: 'Pengurusan Tempahan Berpusat',
    logoUrl: ''
  });

  // Browser Tab and Favicon Integration
  useEffect(() => {
    // Update Title
    if (settings.systemName) {
      document.title = settings.systemName;
    }

    // Update Favicon
    if (settings.logoUrl) {
      const link = document.getElementById('favicon') as HTMLLinkElement;
      if (link) {
        link.href = settings.logoUrl;
      } else {
        const newLink = document.createElement('link');
        newLink.id = 'favicon';
        newLink.rel = 'icon';
        newLink.href = settings.logoUrl;
        document.getElementsByTagName('head')[0].appendChild(newLink);
      }
    }
  }, [settings.systemName, settings.logoUrl]);

  // Sync Settings
  useEffect(() => {
    // Sync Global Settings
    const unsubGlobal = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prev => ({ ...prev, ...data }));
      } else if (profile?.role === 'teacher') {
        setDoc(doc(db, 'settings', 'global'), {
          systemName: 'Sistem Tempahan Makmal Bahasa SKBJ',
          systemDescription: 'Pengurusan Tempahan Berpusat',
          logoUrl: '',
          telegramBotToken: '',
          telegramChatId: '',
          isLabClosed: false,
          labClosedReason: ''
        });
      }
    });

    // Only teachers (admins) can sync security settings (password)
    let unsubSecurity = () => {};
    if (profile?.role === 'teacher') {
      unsubSecurity = onSnapshot(doc(db, 'settings', 'security'), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(prev => ({ 
            ...prev, 
            adminPassword: data.password
          }));
        } else {
          setDoc(doc(db, 'settings', 'security'), { password: 'admin123' });
        }
      });
    }

    return () => {
      unsubGlobal();
      unsubSecurity();
    };
  }, [profile]);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Migration: Ensure everyone is a teacher
          if (data.role !== 'teacher') {
             await updateDoc(docRef, { role: 'teacher' });
             setProfile({ ...data, role: 'teacher' } as UserProfile);
          } else {
            setProfile(data as UserProfile);
          }
        } else {
          // New user defaults to teacher
          const newProfile: UserProfile = {
            uid: u.uid,
            name: u.displayName || 'Unnamed User',
            email: u.email || '',
            role: 'teacher'
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  // Sync Labs
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'labs'), (snapshot) => {
      const labsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lab));
      setLabs(labsData);
      
      // Seed if empty
      if (labsData.length === 0 && profile?.role === 'teacher') {
        addDoc(collection(db, 'labs'), { name: 'Makmal Bahasa', capacity: 30, description: 'Utama' });
      }
    });
  }, [user, profile]);

  // Sync Teachers
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'teachers'), orderBy('name', 'asc'));
    return onSnapshot(q, async (snapshot) => {
      const teachersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Teacher));
      setTeachers(teachersData);

      // Auto-seed if empty and user is logged in as teacher/admin
      if (snapshot.empty && profile?.role === 'teacher') {
        try {
          const batch = writeBatch(db);
          TEACHERS.forEach(tName => {
            const docRef = doc(collection(db, 'teachers'));
            batch.set(docRef, { name: tName, createdAt: serverTimestamp() });
          });
          await batch.commit();
        } catch (err) {
          console.error('Auto-seed teachers error:', err);
        }
      }
    }, (error) => {
      console.error('Teachers sync error:', error);
    });
  }, [user, profile]);

  const handleSeedTeachers = async () => {
    const batch = writeBatch(db);
    TEACHERS.forEach(tName => {
      const docRef = doc(collection(db, 'teachers'));
      batch.set(docRef, { name: tName, createdAt: serverTimestamp() });
    });
    await batch.commit();
  };

  const teacherNames = teachers.length > 0 ? teachers.map(t => t.name) : TEACHERS;

  // Sync Bookings
  useEffect(() => {
    if (!user) return;
    const q = profile?.role === 'teacher' 
      ? collection(db, 'bookings')
      : query(collection(db, 'bookings'), where('userId', '==', user.uid));
    
    return onSnapshot(q, (snapshot) => {
      const bData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      setBookings(bData.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
    });
  }, [user, profile]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Firebase Auth Error:', err);
      let message = 'Gagal mendaftar masuk. ';
      
      if (err.code === 'auth/internal-error') {
        message += 'Ralat dalaman Firebase (auth/internal-error). Sila pastikan domain ini telah dibenarkan dalam Firebase Console > Authentication > Settings > Authorized Domains.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        message += 'Tetingkap log masuk ditutup sebelum selesai.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        message += 'Permintaan log masuk dibatalkan.';
      } else {
        message += err.message || 'Sila cuba lagi sebentar.';
      }
      
      alert(message);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user || !profile) {
    return <LoginView onLogin={handleLogin} settings={settings} />;
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden leading-tight lg:flex-row flex-col">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 transition-transform duration-300 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between lg:block">
          <div>
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-1.5 rounded-lg shrink-0">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <BookOpen className="text-white w-5 h-5" />
                )}
              </div>
              <h1 className="text-sm font-bold tracking-tight text-blue-700 leading-tight">{settings.systemName}</h1>
            </div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mt-1.5 line-clamp-1">
              {settings.systemDescription}
            </p>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Menu Utama</div>
          <SidebarNavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            icon={<LayoutDashboard className="w-4 h-4" />}
            label="Papan Pemuka"
          />
          <SidebarNavButton 
            active={activeTab === 'calendar'} 
            onClick={() => { setActiveTab('calendar'); setIsSidebarOpen(false); }}
            icon={<CalendarIcon className="w-4 h-4" />}
            label="Kalendar & Tempah"
          />
          <SidebarNavButton 
            active={activeTab === 'admin'} 
            onClick={() => { setActiveTab('admin'); setIsSidebarOpen(false); }}
            icon={<Lock className="w-4 h-4" />}
            label="Admin Panel"
          />
          
          <div className="pt-4 mt-4 border-t border-slate-100">
            <button 
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50 transition-all duration-150 font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Keluar</span>
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs uppercase">
                {profile.name.substring(0, 2)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate leading-none">{profile.name}</p>
                <p className="text-[9px] text-blue-600 font-bold uppercase tracking-widest mt-1">Guru • Aktif</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-700 tracking-tight flex items-center gap-2">
              <span className="lg:hidden shrink-0">
                {activeTab === 'dashboard' ? <LayoutDashboard className="w-4 h-4 text-blue-600" /> : 
                 activeTab === 'calendar' ? <CalendarIcon className="w-4 h-4 text-blue-600" /> : <Lock className="w-4 h-4 text-blue-600" />}
              </span>
              {activeTab === 'dashboard' ? 'Papan Pemuka' : 
               activeTab === 'calendar' ? 'Kalendar Tempahan' : 'Admin Panel'}
            </h2>
          </div>
          <div className="flex space-x-2 sm:space-x-3 items-center">
            {settings.isLabClosed ? (
              <div className="flex items-center px-3 py-1.5 bg-rose-50 text-rose-700 rounded-full border border-rose-200 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                <span className="w-1.5 h-1.5 bg-rose-600 rounded-full mr-2"></span>
                Tempahan Ditutup
              </div>
            ) : (
              <div className="hidden sm:flex items-center px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-100 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
                Tersedia
              </div>
            )}
            <div className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-6 flex-1 overflow-y-auto bg-slate-50/50">
          <div className="max-w-6xl mx-auto space-y-4">
            {settings.isLabClosed && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-md flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-white/20 shrink-0 mt-0.5">
                  <Ban className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-white/25 text-[9px] font-bold uppercase tracking-wider">
                      Notis Pentadbir
                    </span>
                    <h3 className="text-sm font-bold">Akses Tempahan Makmal Ditutup Sementara</h3>
                  </div>
                  <p className="text-xs text-rose-100 mt-1">
                    {settings.labClosedReason 
                      ? settings.labClosedReason 
                      : 'Makmal Bahasa ditutup untuk sebarang tempahan baharu buat masa ini sehingga dibuka semula oleh Admin.'}
                  </p>
                </div>
                {activeTab !== 'admin' && (
                  <button 
                    onClick={() => setActiveTab('admin')}
                    className="hidden sm:inline-flex items-center px-3 py-1.5 bg-white text-rose-700 text-xs font-bold rounded-lg shadow-sm hover:bg-rose-50 transition-colors shrink-0"
                  >
                    Buka Admin Panel
                  </button>
                )}
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <DashboardView profile={profile} bookings={bookings} settings={settings} onGoToCalendar={() => setActiveTab('calendar')} />
                </motion.div>
              )}
              {activeTab === 'calendar' && (
                <motion.div 
                  key="calendar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <CalendarView 
                    labs={labs} 
                    bookings={bookings} 
                    profile={profile} 
                    settings={settings}
                    teacherNames={teacherNames}
                  />
                </motion.div>
              )}
              {activeTab === 'admin' && (
                <motion.div 
                  key="admin"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <AdminPanelView 
                    bookings={bookings} 
                    settings={settings} 
                    labs={labs}
                    teachers={teachers}
                    teacherNames={teacherNames}
                    onSeedDefault={handleSeedTeachers}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <footer className="h-10 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between px-8 text-[10px] text-slate-500 font-medium">
          <div className="flex space-x-6">
            <span>Notifikasi: <b className="text-slate-800">{bookings.filter(b => b.status === 'pending').length} tempahan baru</b></span>
            <span>Kemaskini terakhir: <b className="text-slate-800">{format(new Date(), 'hh:mm a, dd MMM')}</b></span>
          </div>
          <div className="flex space-x-4">
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-500 mr-2"></span> Pengajaran</div>
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-100 border border-indigo-400 mr-2"></span> Aktiviti</div>
            <div className="flex items-center"><span className="w-2.5 h-2.5 rounded-sm bg-rose-100 border border-rose-400 mr-2"></span> Penyelenggaraan</div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function SidebarNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
        active 
          ? 'bg-blue-50 text-blue-700 font-bold' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      <div className={cn('w-2 h-2 rounded-full transition-colors', active ? 'bg-blue-600' : 'bg-slate-300')}></div>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

// --- View Components ---

function LoginView({ onLogin, settings }: { onLogin: () => void, settings: AppSettings }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 bg-[url('https://picsum.photos/seed/lab/1920/1080?blur=10')] bg-cover">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" />
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white rounded-xl p-8 shadow-2xl relative z-10 text-center border border-slate-200"
      >
        <div className="bg-blue-600 w-16 h-16 rounded-xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-blue-200 overflow-hidden">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <BookOpen className="text-white w-8 h-8" />
          )}
        </div>
        <h1 className="text-2xl font-bold mb-1 tracking-tight text-slate-900">{settings.systemName}</h1>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-8 text-center">{settings.systemDescription}</p>
        
        <Button className="w-full justify-center py-3 text-sm font-bold gap-3 rounded-lg" onClick={onLogin}>
          <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
          Daftar Masuk Google
        </Button>
        
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 italic">
            Akses khas guru untuk pengurusan tempahan Makmal Bahasa.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
        active 
          ? 'bg-white text-indigo-600 shadow-sm' 
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/50'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DashboardView({ 
  profile, 
  bookings, 
  settings, 
  onGoToCalendar 
}: { 
  profile: UserProfile; 
  bookings: Booking[]; 
  settings?: AppSettings; 
  onGoToCalendar?: () => void; 
}) {
  const stats = {
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    total: bookings.length
  };

  return (
    <div className="space-y-6">
      {settings?.isLabClosed && (
        <Card className="p-5 border-l-4 border-l-rose-500 bg-rose-50/50">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-700">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-rose-900">Makmal Bahasa Ditutup Sementara</h3>
              <p className="text-xs text-rose-700 mt-0.5">
                {settings.labClosedReason || 'Pihak pentadbir telah menutup sementara akses tempahan makmal. Pengguna tidak boleh menghantar sebarang tempahan baharu.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
        <StatCard title="Menunggu" value={stats.pending} icon={<Clock className="text-amber-500 w-5 h-5" />} color="amber" />
        <StatCard title="Disahkan" value={stats.confirmed} icon={<CheckCircle2 className="text-emerald-500 w-5 h-5" />} color="emerald" />
        <div className="col-span-2 md:col-span-1">
          <StatCard title="Jumlah Rekod" value={stats.total} icon={<LayoutDashboard className="text-blue-500 w-5 h-5" />} color="blue" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            Log Tempahan Terkini
          </h2>
          <span className="text-[10px] font-bold text-slate-400">Papar Semua →</span>
        </div>
        
        {bookings.filter(b => b.status === 'confirmed').length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-100 rounded-xl p-10 text-center text-slate-400 text-sm font-medium">
            Tiada data tempahan ditemui makmal kali ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookings
              .filter(b => b.status === 'confirmed')
              .slice(0, 6)
              .map(booking => (
                <div key={booking.id}>
                  <BookingCard booking={booking} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: number, icon: React.ReactNode, color: string }) {
  const bgStyles: any = {
    amber: 'bg-amber-50 border-amber-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    blue: 'bg-blue-50 border-blue-100'
  };

  return (
    <div className={cn('p-4 rounded-xl border-2 shadow-sm bg-white', bgStyles[color])}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</p>
          <span className="text-2xl font-mono font-bold leading-none tracking-tighter text-slate-900">{value}</span>
        </div>
        <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100">{icon}</div>
      </div>
    </div>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  const statusStyles: any = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200'
  };

  return (
    <Card className="hover:border-blue-300 transition-all group">
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <span className={cn('px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest', statusStyles[booking.status])}>
            {booking.status === 'pending' ? 'Pending' : booking.status === 'confirmed' ? 'Approved' : 'Rejected'}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
             {booking.createdAt?.seconds ? format(new Date(booking.createdAt.seconds * 1000), 'dd/MM') : 'NOW'}
          </span>
        </div>
        <h3 className="font-bold text-sm text-slate-800 mb-1 truncate group-hover:text-blue-600 transition-colors">{booking.labName}</h3>
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3">{booking.teacherName}</p>
        
        <div className="space-y-1.5 grayscale group-hover:grayscale-0 transition-all">
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
            <CalendarIcon className="w-3.5 h-3.5 text-slate-400" /> {format(new Date(booking.date), 'dd MMM yyyy')}
          </p>
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> {booking.timeSlots?.join(', ')}
          </p>
          <div className="flex gap-4 pt-1">
             <p className="text-[10px] text-slate-400 font-bold"><span className="text-slate-300">KELAS:</span> {booking.className}</p>
             <p className="text-[10px] text-slate-400 font-bold"><span className="text-slate-300">TUJUAN:</span> {booking.purpose}</p>
          </div>
        </div>
        {booking.reason && (
          <div className="mt-3 p-2 bg-slate-50 rounded-lg text-[10px] text-slate-600 border border-slate-100 italic">
            {booking.reason}
          </div>
        )}
      </div>
    </Card>
  );
}

function CalendarView({ labs, bookings, profile, settings, teacherNames }: { labs: Lab[], bookings: Booking[], profile: UserProfile, settings: AppSettings, teacherNames?: string[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  useEffect(() => {
    if (labs.length > 0 && !selectedLab) {
      setSelectedLab(labs[0]);
    }
  }, [labs]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const bookingsOnSelectedDay = bookings.filter(b => 
    isSameDay(new Date(b.date), selectedDay) && b.labId === selectedLab?.id && b.status !== 'rejected'
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Calendar Grid */}
      <div className="lg:col-span-8 space-y-4">
        <Card className="p-4 bg-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Penjadualan Induk</p>
            </div>
            <div className="flex gap-1">
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-100 border border-slate-100 rounded-lg overflow-hidden">
            {['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'].map(day => (
              <div key={day} className="text-center text-[9px] font-bold text-slate-400 uppercase py-2 bg-slate-50">
                {day}
              </div>
            ))}
            {calendarDays.map(day => {
              const isSelected = isSameDay(day, selectedDay);
              const today = startOfToday();
              const tomorrow = addDays(today, 1);
              const isToday = isSameDay(day, today);
              const isTomorrow = isSameDay(day, tomorrow);
              const isAllowable = isToday || isTomorrow;
              
              const isCurrentMonth = isSameMonth(day, monthStart);
              const hasBooking = bookings.some(b => isSameDay(new Date(b.date), day) && b.labId === selectedLab?.id && b.status === 'confirmed');
              const isPast = isBefore(day, today);

              return (
                <button
                  key={day.toString()}
                  onClick={() => setSelectedDay(day)}
                  disabled={!isCurrentMonth}
                  className={cn(
                    'aspect-square h-auto min-h-[3rem] sm:min-h-[4rem] p-1 sm:p-1.5 flex flex-col items-center justify-start transition-all relative bg-white',
                    !isCurrentMonth && 'bg-slate-50 opacity-30 pointer-events-none',
                    isSelected && 'bg-blue-600 text-white z-10 shadow-inner',
                    isToday && !isSelected && 'bg-blue-50 text-blue-700',
                    isTomorrow && !isSelected && 'bg-indigo-50 text-indigo-700',
                    isPast && !isSelected && 'text-slate-300',
                    !isAllowable && isCurrentMonth && 'text-slate-500'
                  )}
                >
                  <span className="text-[11px] font-bold self-start">{format(day, 'd')}</span>
                  <div className="mt-auto w-full flex flex-wrap gap-0.5 justify-center">
                    {hasBooking && (
                      <div className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-white' : 'bg-emerald-500')} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Side Info */}
      <div className="lg:col-span-4 space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Pilih Lokasi</label>
          <div className="grid grid-cols-1 gap-2">
            {labs.map(lab => (
              <button
                key={lab.id}
                onClick={() => setSelectedLab(lab)}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-all',
                  selectedLab?.id === lab.id 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                )}
              >
                <div className="flex items-center gap-2">
                  <BookOpen className={cn('w-4 h-4', selectedLab?.id === lab.id ? 'text-blue-600' : 'text-slate-400')} />
                  <span className="text-xs font-bold">{lab.name}</span>
                </div>
                <span className="text-[9px] font-mono opacity-60">{lab.capacity}p</span>
              </button>
            ))}
          </div>
        </div>

        <Card className={cn("p-4 bg-white border-l-4", settings?.isLabClosed ? "border-l-rose-500" : "border-l-blue-600")}>
          <div className="mb-4">
            <h3 className="font-bold text-sm text-slate-800">{format(selectedDay, 'eeee, dd MMM')}</h3>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">Slot Makmal: {selectedLab?.name}</p>
          </div>

          {settings?.isLabClosed && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <div className="flex items-center gap-1.5 font-bold">
                <Ban className="w-4 h-4 text-rose-600" />
                <span>Makmal Ditutup Oleh Pentadbir</span>
              </div>
              <p className="text-[10px] text-rose-600 mt-1 leading-relaxed">
                {settings.labClosedReason || 'Tempahan tidak dibenarkan buat masa ini sehingga dibuka semula oleh Admin.'}
              </p>
            </div>
          )}

          <div className="space-y-2 mb-2">
            {TIME_SLOTS.map(slot => {
              const booking = bookingsOnSelectedDay.find(b => b.timeSlots?.includes(slot));
              const today = startOfToday();
              const tomorrow = addDays(today, 1);
              const isToday = isSameDay(selectedDay, today);
              const isTomorrow = isSameDay(selectedDay, tomorrow);
              const isAllowable = isToday || isTomorrow;
              
              return (
                <div 
                  key={slot}
                  className={cn(
                    'p-2 rounded-lg border flex items-center justify-between transition-colors',
                    booking 
                      ? (booking.status === 'confirmed' ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100')
                      : 'bg-slate-50 border-slate-100'
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono font-bold text-slate-400 leading-none mb-1">{slot}</span>
                    {booking ? (
                      <span className={cn('text-[11px] font-bold', booking.status === 'confirmed' ? 'text-blue-700' : 'text-amber-700')}>
                        {booking.status === 'confirmed' ? 'Ditempah' : 'Menunggu'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 italic">Tersedia</span>
                    )}
                  </div>
                  {!booking && !settings?.isLabClosed && isAllowable && (
                    <Button size="sm" variant="outline" className="h-7 py-0 px-2 text-[10px] border-blue-400 text-blue-600" onClick={() => setIsBookingModalOpen(true)}>Tempah</Button>
                  )}
                  {!booking && settings?.isLabClosed && isAllowable && (
                    <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 uppercase tracking-tighter flex items-center gap-1">
                      <Ban className="w-2.5 h-2.5" /> Ditutup
                    </span>
                  )}
                  {!booking && !isAllowable && (
                     <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">Tutup</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <AnimatePresence>
        {isBookingModalOpen && selectedLab && (
          <BookingModal 
            lab={selectedLab}
            date={selectedDay}
            onClose={() => setIsBookingModalOpen(false)}
            profile={profile}
            existingBookings={bookingsOnSelectedDay}
            settings={settings}
            teacherNames={teacherNames}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BookingModal({ 
  lab, 
  date, 
  onClose, 
  profile,
  existingBookings,
  settings,
  teacherNames
}: { 
  lab: Lab, 
  date: Date, 
  onClose: () => void, 
  profile: UserProfile,
  existingBookings: Booking[],
  settings: AppSettings,
  teacherNames?: string[]
}) {
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);

  const availableTeachers = teacherNames && teacherNames.length > 0 ? teacherNames : TEACHERS;

  const toggleSlot = (slot: string) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(prev => prev.filter(s => s !== slot));
    } else {
      if (selectedSlots.length >= 3) {
        alert('Anda hanya boleh memilih maksimum 3 slot masa sahaja.');
        return;
      }
      setSelectedSlots(prev => [...prev].concat(slot).sort());
    }
  };

  const handleBooking = async () => {
    if (selectedSlots.length === 0 || !teacherName || !className || !purpose) return;
    
    if (settings?.isLabClosed) {
      alert('Maaf, Makmal Bahasa sedang ditutup untuk tempahan oleh pihak Pentadbir.\n\nSebab: ' + (settings.labClosedReason || 'Akses ditutup buat sementara waktu.'));
      return;
    }

    const today = startOfToday();
    const tomorrow = addDays(today, 1);
    const isToday = isSameDay(date, today);
    const isTomorrow = isSameDay(date, tomorrow);
    const isAllowable = isToday || isTomorrow;

    if (!isAllowable) {
      alert('Maaf, tempahan hanya dibenarkan untuk hari ini dan esok sahaja.');
      return;
    }

    setLoading(true);
    try {
      const bookingData = {
        labId: lab.id,
        labName: lab.name,
        date: format(date, 'yyyy-MM-dd'),
        timeSlots: selectedSlots,
        userId: profile.uid,
        userName: profile.name,
        teacherName,
        className,
        purpose,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'bookings'), bookingData);
      const newBookingId = docRef.id;

      // Send Telegram Notification if configured
      if (settings.telegramBotToken && settings.telegramChatId) {
        const message = `🔔 *TEMPAHAN BARU*\n\n` +
          `👤 *Guru:* ${teacherName}\n` +
          `🏫 *Makmal:* ${lab.name}\n` +
          `📅 *Tarikh:* ${format(date, 'dd/MM/yyyy')}\n` +
          `⏰ *Slot:* ${selectedSlots.join(', ')}\n` +
          `📚 *Kelas:* ${className}\n` +
          `🎯 *Tujuan:* ${purpose}`;

        fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: settings.telegramChatId,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Lulus', callback_data: `approve:${newBookingId}` },
                  { text: '❌ Tolak', callback_data: `reject:${newBookingId}` }
                ]
              ]
            }
          })
        }).catch(err => console.error('Telegram notification failed:', err));
      }

      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = selectedSlots.length > 0 && teacherName && className && purpose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-white rounded-2xl p-6 sm:p-8 max-w-xl w-full relative z-10 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
      >
        <div className="mb-6 border-b border-slate-100 pb-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">Permohonan Tempahan Baru</h2>
          <div className="flex gap-4 mt-2">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen className="w-3 h-3 text-blue-500" /> {lab.name}
            </p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <CalendarIcon className="w-3 h-3 text-blue-500" /> {format(date, 'dd MMMM yyyy')}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">01. Maklumat Guru</label>
              <select 
                value={teacherName} 
                onChange={e => setTeacherName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-bold bg-slate-50 focus:bg-white focus:border-blue-500 transition-all outline-none"
              >
                <option value="">-- Pilih Nama ({availableTeachers.length} Guru) --</option>
                {availableTeachers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">02. Kelas Diambil</label>
              <select 
                value={className} 
                onChange={e => setClassName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-bold bg-slate-50 focus:bg-white focus:border-blue-500 transition-all outline-none"
              >
                <option value="">-- Pilih Kelas --</option>
                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">03. Tujuan Penggunaan</label>
              <select 
                value={purpose} 
                onChange={e => setPurpose(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-bold bg-slate-50 focus:bg-white focus:border-blue-500 transition-all outline-none"
              >
                <option value="">-- Pilih Tujuan --</option>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">04. Slot Masa (Maksimum 3)</label>
            <div className="grid grid-cols-2 gap-1.5 overflow-y-auto max-h-[220px] pr-1 scrollbar-thin">
              {TIME_SLOTS.map(slot => {
                 const isTaken = existingBookings.some(b => b.timeSlots?.includes(slot));
                 const isSelected = selectedSlots.includes(slot);
                 return (
                  <button
                    key={slot}
                    disabled={isTaken}
                    onClick={() => toggleSlot(slot)}
                    className={cn(
                      'p-2 rounded-lg border text-[9px] font-bold transition-all text-center leading-tight flex items-center justify-center h-10',
                      isTaken 
                        ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed line-through'
                        : isSelected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100' 
                          : 'border-slate-100 hover:border-blue-200 text-slate-500 bg-white'
                    )}
                  >
                    {slot}
                  </button>
                 );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <Button variant="secondary" className="flex-1 font-bold py-3 text-xs uppercase" onClick={onClose} disabled={loading}>Batal</Button>
          <Button className="flex-1 font-bold py-3 text-xs uppercase" onClick={handleBooking} disabled={!isFormValid || loading}>
            {loading ? 'Hantar...' : 'Sahkan Tempahan'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function AdminPanelView({ 
  bookings, 
  settings, 
  labs, 
  teachers, 
  teacherNames, 
  onSeedDefault 
}: { 
  bookings: Booking[]; 
  settings: AppSettings; 
  labs: Lab[]; 
  teachers: Teacher[]; 
  teacherNames: string[]; 
  onSeedDefault: () => Promise<void>; 
}) {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');
  const [adminTab, setAdminTab] = useState<'approvals' | 'teachers' | 'settings' | 'reports'>('approvals');

  const adminSecret = settings.adminPassword || "admin123";

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPass === adminSecret) {
      setIsAdminAuthenticated(true);
      setError('');
    } else {
      setError('Kata laluan salah. Sila cuba lagi.');
    }
  };

  if (!isAdminAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <Card className="p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold">Log Masuk Admin</h2>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">Akses Kawalan Sahaja</p>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-center">Kata Laluan Admin</label>
              <input 
                type="password" 
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-500 transition-colors text-center"
                autoFocus
              />
            </div>
            {error && <p className="text-rose-500 text-[10px] font-bold uppercase text-center">{error}</p>}
            <Button type="submit" className="w-full py-3 h-12 uppercase tracking-widest">Masuk Panel Admin</Button>
          </form>
        </Card>
      </div>
    );
  }

  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 -mx-1 p-1">
        <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl w-fit whitespace-nowrap overflow-x-auto">
          <button 
            onClick={() => setAdminTab('approvals')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5",
              adminTab === 'approvals' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pengesahan
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setAdminTab('teachers')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5",
              adminTab === 'teachers' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Senarai Guru
            <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold font-mono">
              {teachers.length || teacherNames.length}
            </span>
          </button>
          <button 
            onClick={() => setAdminTab('settings')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5",
              adminTab === 'settings' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Tetapan Sistem
          </button>
          <button 
            onClick={() => setAdminTab('reports')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5",
              adminTab === 'reports' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Laporan
          </button>
        </div>

        {/* Quick Lab Closure Indicator / Toggle */}
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            type="button"
            onClick={async () => {
              const currentStatus = Boolean(settings.isLabClosed);
              const nextStatus = !currentStatus;
              let reason = settings.labClosedReason || '';
              if (nextStatus && !reason) {
                const promptReason = prompt('Masukkan alasan penutupan makmal (pilihan):', 'Makmal Bahasa ditutup sementara oleh Pentadbir.');
                if (promptReason !== null) reason = promptReason;
              }
              try {
                await updateDoc(doc(db, 'settings', 'global'), {
                  isLabClosed: nextStatus,
                  labClosedReason: reason
                });
              } catch (e) {
                console.error(e);
                alert('Gagal mengemaskini status makmal.');
              }
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95",
              settings.isLabClosed
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
            title={settings.isLabClosed ? "Klik untuk buka semula akses tempahan" : "Klik untuk tutup akses tempahan makmal"}
          >
            {settings.isLabClosed ? (
              <>
                <Ban className="w-3.5 h-3.5" />
                <span>Makmal: Ditutup (Klik Buka)</span>
              </>
            ) : (
              <>
                <Power className="w-3.5 h-3.5" />
                <span>Makmal: Dibuka (Klik Tutup)</span>
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {adminTab === 'approvals' && (
          <motion.div key="approvals" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <AdminApprovalsView bookings={bookings} teacherNames={teacherNames} />
          </motion.div>
        )}
        {adminTab === 'teachers' && (
          <motion.div key="teachers" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <AdminTeachersView teachers={teachers} onSeedDefault={onSeedDefault} />
          </motion.div>
        )}
        {adminTab === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <AdminSettingsView 
              settings={settings} 
              labs={labs} 
              onOpenTeachersTab={() => setAdminTab('teachers')}
              teachersCount={teachers.length || teacherNames.length}
            />
          </motion.div>
        )}
        {adminTab === 'reports' && (
          <motion.div key="reports" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <AdminReportsView bookings={bookings} settings={settings} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminApprovalsView({ bookings, teacherNames }: { bookings: Booking[], teacherNames?: string[] }) {
  const pendingBookings = bookings.filter(b => b.status === 'pending');
  const pastBookings = bookings.filter(b => b.status !== 'pending');
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

  const handleAction = async (id: string, status: BookingStatus) => {
    const reason = status === 'rejected' ? prompt('Sila nyatakan sebab penolakan:') : '';
    if (status === 'rejected' && reason === null) return;
    
    try {
      await updateDoc(doc(db, 'bookings', id), { 
        status, 
        reason: reason || '' 
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      {editingBooking && (
        <EditBookingModal 
          booking={editingBooking} 
          onClose={() => setEditingBooking(null)} 
        />
      )}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 border-b border-slate-200 pb-2">
          <AlertCircle className="text-amber-500 w-4 h-4" /> Pengesahan Diperlukan
        </h2>
        {pendingBookings.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-100 text-slate-400 p-8 rounded-xl text-center text-sm font-medium">
            Tiada permohonan baru untuk diproses.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingBookings.map(b => (
              <div key={b.id}>
                <Card className="relative bg-white border-l-4 border-l-amber-400 shadow-sm">
                  <div className="p-4">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="bg-slate-100 p-2 rounded-lg">
                        <User className="w-4 h-4 text-slate-500" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs leading-none mb-0.5">{b.teacherName}</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Pemohon: {b.userName}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-1.5 mb-4 px-1">
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold">
                        <BookOpen className="w-3.5 h-3.5 text-blue-500" /> {b.labName} 
                        <span className="text-slate-300 mx-1">|</span> {b.className}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" /> {format(new Date(b.date), 'dd MMM yyyy')}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 font-bold">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> {b.timeSlots?.join(', ')}
                      </div>
                      <div className="mt-2 py-1 px-2 bg-blue-50 rounded text-[9px] font-bold text-blue-600 uppercase inline-block">
                        TUJUAN: {b.purpose}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button className="flex-1 bg-blue-600 h-8 font-bold" size="sm" onClick={() => handleAction(b.id, 'confirmed')}>
                        Lulus
                      </Button>
                      <Button variant="secondary" className="flex-1 h-8 font-bold" size="sm" onClick={() => handleAction(b.id, 'rejected')}>
                        Tolak
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          Arsip Tempahan
        </h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-2.5 font-bold text-slate-400 uppercase tracking-widest">Pemohon</th>
                  <th className="px-6 py-2.5 font-bold text-slate-400 uppercase tracking-widest">Makmal</th>
                  <th className="px-6 py-2.5 font-bold text-slate-400 uppercase tracking-widest">Masa</th>
                  <th className="px-6 py-2.5 font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-2.5 font-bold text-slate-400 uppercase tracking-widest text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pastBookings.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-bold text-slate-800">{b.teacherName}</p>
                      <p className="text-[9px] text-slate-400">Oleh: {b.userName}</p>
                    </td>
                    <td className="px-6 py-3 text-slate-600 font-medium">
                      {b.labName}
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-bold text-slate-700">{format(new Date(b.date), 'dd/MM/yy')}</p>
                      <p className="text-[9px] font-mono text-slate-400">{b.timeSlots?.join(', ')}</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn(
                        'px-2 py-0.5 rounded border-l-2 text-[9px] font-bold uppercase tracking-wider',
                        b.status === 'confirmed' ? 'bg-blue-50 text-blue-700 border-blue-400' : 'bg-rose-50 text-rose-700 border-rose-400'
                      )}>
                        {b.status === 'confirmed' ? 'SIAP' : 'BATAL'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right flex justify-end gap-2">
                      {b.status === 'confirmed' && (
                        <>
                          <button 
                            onClick={() => setEditingBooking(b)} 
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold uppercase text-[9px]"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button 
                            onClick={() => handleAction(b.id, 'rejected')} 
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold uppercase text-[9px]"
                          >
                            <XCircle className="w-3 h-3" /> Batal
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {editingBooking && (
          <EditBookingModal 
            booking={editingBooking} 
            onClose={() => setEditingBooking(null)} 
            teacherNames={teacherNames}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EditBookingModal({ 
  booking, 
  onClose,
  teacherNames
}: { 
  booking: Booking, 
  onClose: () => void,
  teacherNames?: string[]
}) {
  const [selectedSlots, setSelectedSlots] = useState<string[]>(booking.timeSlots || []);
  const [teacherName, setTeacherName] = useState(booking.teacherName || '');
  const [className, setClassName] = useState(booking.className || '');
  const [purpose, setPurpose] = useState(booking.purpose || '');
  const [loading, setLoading] = useState(false);

  const availableTeachers = teacherNames && teacherNames.length > 0 ? teacherNames : TEACHERS;

  // We need to know other bookings on the same day for slot conflict check
  const [dayBookings, setDayBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'bookings'), 
      where('date', '==', booking.date),
      where('labId', '==', booking.labId)
    );
    return onSnapshot(q, (snapshot) => {
      setDayBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
    });
  }, [booking.date, booking.labId]);

  const toggleSlot = (slot: string) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(prev => prev.filter(s => s !== slot));
    } else {
      if (selectedSlots.length >= 3) {
        alert('Maksimum 3 slot masa sahaja.');
        return;
      }
      setSelectedSlots(prev => [...prev].concat(slot).sort());
    }
  };

  const handleUpdate = async () => {
    if (selectedSlots.length === 0 || !teacherName || !className || !purpose) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        timeSlots: selectedSlots,
        teacherName,
        className,
        purpose,
        updatedAt: serverTimestamp()
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Gagal mengemaskini tempahan.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = selectedSlots.length > 0 && teacherName && className && purpose;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-white rounded-2xl p-6 sm:p-8 max-w-xl w-full relative z-10 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
      >
        <div className="mb-6 border-b border-slate-100 pb-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">Kemaskini Tempahan</h2>
          <div className="flex gap-4 mt-2">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen className="w-3 h-3 text-blue-500" /> {booking.labName}
            </p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <CalendarIcon className="w-3 h-3 text-blue-500" /> {format(new Date(booking.date), 'dd MMMM yyyy')}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">01. Maklumat Guru</label>
              <select 
                value={teacherName} 
                onChange={e => setTeacherName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-bold bg-slate-50 focus:bg-white focus:border-blue-500 transition-all outline-none"
              >
                <option value="">-- Pilih Nama ({availableTeachers.length} Guru) --</option>
                {availableTeachers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">02. Kelas Diambil</label>
              <select 
                value={className} 
                onChange={e => setClassName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-bold bg-slate-50 focus:bg-white focus:border-blue-500 transition-all outline-none"
              >
                <option value="">-- Pilih Kelas --</option>
                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">03. Tujuan Penggunaan</label>
              <select 
                value={purpose} 
                onChange={e => setPurpose(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs font-bold bg-slate-50 focus:bg-white focus:border-blue-500 transition-all outline-none"
              >
                <option value="">-- Pilih Tujuan --</option>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">04. Slot Masa (Maksimum 3)</label>
            <div className="grid grid-cols-2 gap-1.5 overflow-y-auto max-h-[220px] pr-1 scrollbar-thin">
              {TIME_SLOTS.map(slot => {
                 // Taken by OTHER bookings (excluding this one)
                 const isTaken = dayBookings.some(b => b.id !== booking.id && b.status === 'confirmed' && b.timeSlots?.includes(slot));
                 const isSelected = selectedSlots.includes(slot);
                 return (
                  <button
                    key={slot}
                    disabled={isTaken}
                    onClick={() => toggleSlot(slot)}
                    className={cn(
                      'p-2 rounded-lg border text-[9px] font-bold transition-all text-center leading-tight flex items-center justify-center h-10',
                      isTaken 
                        ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed line-through'
                        : isSelected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100' 
                          : 'border-slate-100 hover:border-blue-200 text-slate-500 bg-white'
                    )}
                  >
                    {slot}
                  </button>
                 );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <Button variant="secondary" className="flex-1 font-bold py-3 text-xs uppercase" onClick={onClose} disabled={loading}>Batal</Button>
          <Button className="flex-1 font-bold py-3 text-xs uppercase" onClick={handleUpdate} disabled={!isFormValid || loading}>
            {loading ? 'Mengemaskini...' : 'Simpan Kemaskini'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function AdminTeachersView({ 
  teachers, 
  onSeedDefault 
}: { 
  teachers: Teacher[]; 
  onSeedDefault: () => Promise<void>; 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const sortedTeachers = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'ms'));

  const filteredTeachers = sortedTeachers.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTeacherName.trim().toUpperCase();
    if (!cleanName) {
      setFeedback({ type: 'error', message: 'Sila masukkan nama guru.' });
      return;
    }
    if (teachers.some(t => t.name.toUpperCase() === cleanName)) {
      setFeedback({ type: 'error', message: `Guru "${cleanName}" sudah wujud dalam senarai.` });
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'teachers'), {
        name: cleanName,
        createdAt: serverTimestamp()
      });
      setNewTeacherName('');
      setIsAdding(false);
      setFeedback({ type: 'success', message: `Guru "${cleanName}" berjaya ditambah!` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Gagal menambah guru: ' + (err.message || 'Ralat sistem.') });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    const cleanName = editName.trim().toUpperCase();
    if (!cleanName) {
      setFeedback({ type: 'error', message: 'Nama guru tidak boleh dibiarkan kosong.' });
      return;
    }
    if (teachers.some(t => t.id !== editingTeacher.id && t.name.toUpperCase() === cleanName)) {
      setFeedback({ type: 'error', message: `Nama "${cleanName}" sudah digunakan oleh guru lain.` });
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'teachers', editingTeacher.id), {
        name: cleanName,
        updatedAt: serverTimestamp()
      });
      setFeedback({ type: 'success', message: `Nama guru berjaya dikemaskini kepada "${cleanName}"!` });
      setEditingTeacher(null);
      setEditName('');
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Gagal mengemaskini guru: ' + (err.message || 'Ralat sistem.') });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    const confirmed = window.confirm(`Adakah anda pasti mahu memadam guru "${teacher.name}" daripada senarai?\n\nNama ini tidak akan dipaparkan dalam borang tempahan.`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'teachers', teacher.id));
      setFeedback({ type: 'success', message: `Guru "${teacher.name}" berjaya dipadam.` });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Gagal memadam guru: ' + (err.message || 'Ralat sistem.') });
    }
  };

  const handleRestoreDefault = async () => {
    const confirmed = window.confirm(`Adakah anda pasti mahu memuat naik senarai asal 45 guru ke pangkalan data?`);
    if (!confirmed) return;

    setSeeding(true);
    try {
      await onSeedDefault();
      setFeedback({ type: 'success', message: 'Senarai asal 45 guru berjaya dimuat naik!' });
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Gagal memuat naik senarai asal: ' + (err.message || 'Ralat sistem.') });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8 bg-gradient-to-r from-blue-50/70 via-white to-slate-50 border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-blue-600 text-white shadow-sm">
                <Users className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Pengurusan Senarai Guru</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold font-mono">
                {teachers.length} Guru
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Tambah nama guru baru, tukar ejaan atau padam guru untuk borang pilihan tempahan makmal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button 
              onClick={() => { setIsAdding(true); setEditingTeacher(null); }}
              className="font-bold text-xs uppercase tracking-wider h-9 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Guru Baru
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleRestoreDefault} 
              disabled={seeding}
              className="font-bold text-xs tracking-wider h-9 gap-1.5 text-slate-600"
              title="Muat semula senarai asal 45 guru"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {seeding ? 'Memuatkan...' : 'Muat Semula 45 Asal'}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {feedback && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                "mt-4 p-3 rounded-lg text-xs font-bold flex items-center justify-between",
                feedback.type === 'success' ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
              )}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                <span>{feedback.message}</span>
              </div>
              <button onClick={() => setFeedback(null)} className="text-xs hover:opacity-75">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-6 border-2 border-blue-500 bg-blue-50/20">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-blue-100">
                <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" /> Tambah Nama Guru Baru
                </h3>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddTeacher} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono">
                    Nama Penuh Guru (Huruf Besar)
                  </label>
                  <input 
                    type="text" 
                    value={newTeacherName}
                    onChange={e => setNewTeacherName(e.target.value.toUpperCase())}
                    placeholder="Contoh: AHMAD DANIAL BIN ABDULLAH"
                    className="w-full p-3 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all uppercase"
                    autoFocus
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Nama akan disimpan secara automatik dalam huruf besar untuk keselarasan rekod.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setIsAdding(false)}>
                    Batal
                  </Button>
                  <Button type="submit" size="sm" disabled={loading || !newTeacherName.trim()} className="font-bold">
                    {loading ? 'Menyimpan...' : 'Simpan Guru Baru'}
                  </Button>
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingTeacher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-blue-600" /> Kemaskini Nama Guru
                </h3>
                <button onClick={() => setEditingTeacher(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUpdateTeacher} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                    Nama Guru
                  </label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={e => setEditName(e.target.value.toUpperCase())}
                    className="w-full p-3 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-800 outline-none focus:border-blue-500 uppercase"
                    autoFocus
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setEditingTeacher(null)}>
                    Batal
                  </Button>
                  <Button type="submit" size="sm" disabled={loading || !editName.trim()} className="font-bold">
                    {loading ? 'Mengemaskini...' : 'Simpan Perubahan'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari nama guru..."
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs font-semibold outline-none focus:border-blue-500 transition-colors"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between sm:justify-end gap-2">
            <span>Menunjukkan: <b className="text-slate-800">{filteredTeachers.length}</b> daripada {teachers.length} guru</span>
          </div>
        </div>

        {filteredTeachers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[600px] overflow-y-auto pr-1">
            {filteredTeachers.map((teacher, index) => {
              const parts = teacher.name.split(' ').filter(p => !['BIN', 'BINTI', 'BTE', 'ANAK', 'A/L', 'A/P', '@'].includes(p));
              const initials = parts.length >= 2 
                ? (parts[0][0] + parts[1][0]).toUpperCase() 
                : teacher.name.substring(0, 2).toUpperCase();

              return (
                <div 
                  key={teacher.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:border-blue-200 hover:shadow-xs transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span className="text-[10px] font-mono font-bold text-slate-300 w-5 text-right shrink-0">
                      {index + 1}.
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate leading-tight group-hover:text-blue-600 transition-colors">
                        {teacher.name}
                      </p>
                      <p className="text-[9px] text-slate-400 font-mono tracking-tight">
                        ID: {teacher.id.substring(0, 8)}...
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditingTeacher(teacher); setEditName(teacher.name); }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Kemaskini Nama"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTeacher(teacher)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Padam Guru"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-600">
              {searchTerm ? `Tiada nama guru sepadan dengan carian "${searchTerm}"` : 'Tiada guru didaftarkan dalam sistem.'}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {searchTerm ? 'Cuba kata kunci yang lain atau kosongkan carian.' : 'Klik butang di bawah untuk memuat naik senarai asal 45 guru atau tambah guru baru.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {searchTerm && (
                <Button size="sm" variant="secondary" onClick={() => setSearchTerm('')}>
                  Kosongkan Carian
                </Button>
              )}
              {!searchTerm && (
                <>
                  <Button size="sm" onClick={() => setIsAdding(true)}>
                    + Tambah Guru Baru
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRestoreDefault} disabled={seeding}>
                    Muat Naik 45 Guru Asal
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function AdminSettingsView({ 
  settings, 
  labs, 
  onOpenTeachersTab, 
  teachersCount 
}: { 
  settings: AppSettings; 
  labs: Lab[]; 
  onOpenTeachersTab?: () => void; 
  teachersCount?: number; 
}) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleDeleteLab = async (id: string) => {
    if (!confirm('Adakah anda pasti mahu memadam makmal ini? Semua tempahan berkaitan mungkin terjejas.')) return;
    try {
      await deleteDoc(doc(db, 'labs', id));
    } catch (err) {
      console.error(err);
      alert('Gagal memadam makmal.');
    }
  };

  const handleUpdateLab = async (id: string, currentName: string) => {
    const newName = prompt('Masukkan nama makmal baru:', currentName);
    if (!newName || newName === currentName) return;
    try {
      await updateDoc(doc(db, 'labs', id), { name: newName });
    } catch (err) {
      console.error(err);
      alert('Gagal mengemaskini nama makmal.');
    }
  };

  const handleAddLab = async () => {
    const name = prompt('Masukkan nama makmal baru:');
    if (!name) return;
    try {
      await addDoc(collection(db, 'labs'), { name, capacity: 30, description: 'Utama' });
    } catch (err) {
      console.error(err);
      alert('Gagal menambah makmal.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Save everything to global settings in one go
      const globalData = {
        systemName: form.systemName,
        systemDescription: form.systemDescription,
        logoUrl: form.logoUrl,
        telegramBotToken: form.telegramBotToken || '',
        telegramChatId: form.telegramChatId || '',
        isLabClosed: Boolean(form.isLabClosed),
        labClosedReason: form.labClosedReason || ''
      };
      await setDoc(doc(db, 'settings', 'global'), globalData);
      
      // Save security settings if changed
      const securityUpdate: any = {};
      if (form.adminPassword) securityUpdate.password = form.adminPassword;

      if (Object.keys(securityUpdate).length > 0) {
        await setDoc(doc(db, 'settings', 'security'), securityUpdate);
      }
      
      alert('Tetapan berjaya disimpan!');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan tetapan.');
    }
    setSaving(false);
  };

  const handleSetupWebhook = async () => {
    if (!form.telegramBotToken) {
      alert('Sila masukkan Telegram Bot Token terlebih dahulu.');
      return;
    }
    
    // Determine the URL to use. Preference: User provided Vercel URL, then current origin.
    const currentUrl = window.location.origin;
    const targetUrl = prompt('Masukkan URL Webhook Utama (Vercel atau Development):', currentUrl);
    
    if (!targetUrl) return;

    try {
      const resp = await fetch(`/api/setup-telegram-webhook?token=${form.telegramBotToken}&url=${encodeURIComponent(targetUrl)}`);
      
      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('Server error:', resp.status, errorText);
        alert(`Ralat Server (${resp.status}): ${errorText || 'Gagal menyambung ke API'}`);
        return;
      }

      const data = await resp.json();
      
      if (data.ok) {
        alert('Webhook Telegram berjaya diaktifkan!\nBot anda kini boleh menerima arahan Lulus/Tolak.');
      } else {
        alert('Gagal mengaktifkan webhook: ' + (data.description || 'Ralat dari Telegram'));
      }
    } catch (err) {
      console.error('Setup error details:', err);
      alert('Sistem gagal menghubungi server (Network Error).\n\nPastikan:\n1. Anda telah klik "Simpan Tetapan" terlebih dahulu.\n2. Server Express sedang berjalan (Status: "Ready" di Vercel).');
    }
  };

  return (
    <div className="max-w-2xl">
      <Card className="p-8">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6 border-b border-slate-100 pb-3 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-slate-400" /> Konfigurasi Sistem
        </h3>

        {/* Kawalan Akses & Status Makmal Bahasa */}
        <div className={cn(
          "mb-6 p-5 rounded-2xl border transition-all",
          form.isLabClosed 
            ? "bg-rose-50/70 border-rose-300" 
            : "bg-emerald-50/60 border-emerald-300"
        )}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2.5 rounded-xl text-white shrink-0 shadow-sm",
                form.isLabClosed ? "bg-rose-600" : "bg-emerald-600"
              )}>
                {form.isLabClosed ? <Ban className="w-5 h-5" /> : <Power className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    Status Akses Tempahan Makmal
                  </h4>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                    form.isLabClosed 
                      ? "bg-rose-200 text-rose-800" 
                      : "bg-emerald-200 text-emerald-800"
                  )}>
                    {form.isLabClosed ? 'DITUTUP KEPADA PENGGUNA' : 'DIBUKA (AKTIF)'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {form.isLabClosed
                    ? 'Akses tempahan ditutup. Tiada guru boleh menghantar tempahan baharu sehingga admin membuka semula akses.'
                    : 'Makmal kini dibuka. Guru boleh menempah slot waktu mengikut tarikh yang dibenarkan.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const nextState = !form.isLabClosed;
                setForm(prev => ({ ...prev, isLabClosed: nextState }));
              }}
              className={cn(
                "px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm shrink-0 flex items-center justify-center gap-2 active:scale-95",
                form.isLabClosed
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-rose-600 text-white hover:bg-rose-700"
              )}
            >
              {form.isLabClosed ? (
                <>
                  <Check className="w-4 h-4" /> Buka Akses Makmal
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" /> Tutup Makmal Sekarang
                </>
              )}
            </button>
          </div>

          {form.isLabClosed && (
            <div className="mt-4 pt-4 border-t border-rose-200/80 space-y-2">
              <label className="block text-[10px] font-bold text-rose-900 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-rose-600" />
                Mesej / Alasan Penutupan Makmal (Akan dipaparkan kepada guru):
              </label>
              <textarea
                value={form.labClosedReason || ''}
                onChange={e => setForm({ ...form, labClosedReason: e.target.value })}
                placeholder="Contoh: Makmal Bahasa ditutup sementara untuk kerja-kerja penyelenggaraan komputer & rangkaian. Harap maklum."
                rows={2}
                className="w-full p-2.5 rounded-lg border border-rose-200 bg-white text-xs font-medium text-slate-800 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200 resize-none"
              />
              <p className="text-[10px] text-rose-600 italic">
                *Nota: Sila klik &quot;Simpan Tetapan&quot; di bawah untuk menyimpan perubahan status atau alasan ini ke pelayan.
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nama Sistem</label>
              <input 
                type="text" 
                value={form.systemName}
                onChange={e => setForm({...form, systemName: e.target.value})}
                className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-500"
                placeholder="Contoh: Sistem Booking Makmal Bahasa"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Deskripsi Ringkas</label>
              <input 
                type="text" 
                value={form.systemDescription}
                onChange={e => setForm({...form, systemDescription: e.target.value})}
                className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-500"
                placeholder="Contoh: Pengurusan Tempahan Berpusat"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-bold">Muat Naik Logo</label>
              <div className="flex gap-4 items-start">
                <div className="flex-1">
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 500000) { // 500KB limit for Firestore safety
                            alert('Saiz gambar terlalu besar. Sila guna gambar bawah 500KB.');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setForm({...form, logoUrl: reader.result as string});
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="w-full p-3 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 flex items-center justify-center gap-2 group-hover:border-blue-400 group-hover:bg-blue-50 transition-all h-24">
                      <ImageIcon className="w-4 h-4" />
                      <span>Klik atau seret gambar ke sini</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1.5 font-medium italic">Saiz disyorkan: 128x128px (Maks: 500KB). Gambar disimpan terus dalam sistem.</p>
                </div>
                <div className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="text-slate-300 text-[10px] font-bold text-center p-2">Tiada Logo</div>
                  )}
                </div>
              </div>
              {form.logoUrl && (
                <button 
                  type="button" 
                  onClick={() => setForm({...form, logoUrl: ''})}
                  className="mt-2 text-[10px] text-rose-500 font-bold uppercase hover:underline"
                >
                  Padam Logo
                </button>
              )}
            </div>
          </div>

          {/* Teacher Management Section */}
          <div className="pt-6 mt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" /> Senarai Guru ({teachersCount ?? 0} Orang Berdaftar)
              </h4>
              {onOpenTeachersTab && (
                <button 
                  type="button" 
                  onClick={onOpenTeachersTab}
                  className="text-[10px] text-blue-600 font-bold uppercase hover:underline flex items-center gap-1"
                >
                  Buka Tab Senarai Guru &rarr;
                </button>
              )}
            </div>
            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800">Pengurusan Guru Sekolah</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Tambah nama guru baharu, kemaskini ejaan, atau padam guru daripada senarai borang tempahan.
                </p>
              </div>
              {onOpenTeachersTab && (
                <Button 
                  type="button" 
                  size="sm" 
                  onClick={onOpenTeachersTab}
                  className="text-xs font-bold shrink-0 ml-3 gap-1"
                >
                  <Users className="w-3.5 h-3.5" /> Urus Guru
                </Button>
              )}
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senarai Makmal</h4>
              <button 
                type="button" 
                onClick={handleAddLab}
                className="text-[10px] text-blue-600 font-bold uppercase hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Tambah Makmal
              </button>
            </div>
            <div className="space-y-2">
              {labs.map(lab => (
                <div key={lab.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">{lab.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => handleUpdateLab(lab.id, lab.name)}
                      className="text-[10px] text-blue-600 font-bold uppercase hover:underline"
                    >
                      Edit
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleDeleteLab(lab.id)}
                      className="text-[10px] text-rose-500 font-bold uppercase hover:underline"
                    >
                      Padam
                    </button>
                  </div>
                </div>
              ))}
              {labs.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4">Tiada makmal didaftarkan.</p>
              )}
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Notifikasi Telegram (Percuma)
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bot Token</label>
                <input 
                  type="password" 
                  value={form.telegramBotToken || ''}
                  onChange={e => setForm({...form, telegramBotToken: e.target.value})}
                  className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-500"
                  placeholder="Contoh: 123456789:ABCDE..."
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Chat ID</label>
                <input 
                  type="text" 
                  value={form.telegramChatId || ''}
                  onChange={e => setForm({...form, telegramChatId: e.target.value})}
                  className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-500"
                  placeholder="Contoh: -100123456789 atau 12345678"
                />
              </div>
              <div className="pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-10 border-blue-200 text-blue-600 hover:bg-blue-50 font-bold"
                  onClick={handleSetupWebhook}
                >
                  Aktifkan Webhook (Lulus/Tolak via Telegram)
                </Button>
                <p className="text-[9px] text-slate-400 mt-2 italic text-center">
                  *Klik selepas Simpan Tetapan di atas. Benarkan Admin lulus/tolak terus dari Telegram.
                </p>
              </div>
              <p className="text-[9px] text-slate-400 font-medium italic">
                Dapatkan Bot Token melalui @BotFather. Chat ID adalah ID akaun Telegram anda (guna @userinfobot) atau ID Group (bukan ID Bot).
              </p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Keselamatan</h4>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Kata Laluan Admin Baru</label>
              <div className="relative">
                <input 
                  type="password" 
                  value={form.adminPassword || ''}
                  onChange={e => setForm({...form, adminPassword: e.target.value})}
                  className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-500"
                  placeholder="Sila masukkan kata laluan baru..."
                />
                <Lock className="absolute right-3 top-3.5 w-4 h-4 text-slate-300" />
              </div>
              <p className="text-[9px] text-slate-400 mt-1.5 font-medium italic">Gunakan kata laluan yang kuat untuk mengelakkan akses tanpa kebenaran.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <Button type="submit" disabled={saving} className="px-8 font-bold uppercase tracking-widest text-xs h-10">
              {saving ? 'Menyimpan...' : 'Simpan Tetapan'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function AdminReportsView({ bookings, settings }: { bookings: Booking[], settings: AppSettings }) {
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const [downloading, setDownloading] = useState(false);

  const generatePDF = async () => {
    setDownloading(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Header Section
      let startY = 25;
      
      // School Logo
      if (settings.logoUrl) {
        try {
          doc.addImage(settings.logoUrl, 'PNG', 15, startY - 15, 25, 25);
        } catch (e) {
          console.error('Logo add error:', e);
        }
      }

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(settings.systemName, 45, startY - 5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text('Laporan Tempahan Makmal Bahasa Berjaya (Approved)', 45, startY + 2);
      
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Dijana pada: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 45, startY + 8);
      doc.setTextColor(0);

      // Table Data
      const tableData = confirmedBookings.map((b, index) => [
        index + 1,
        b.teacherName,
        b.className,
        b.timeSlots?.join(', ') || '-',
        format(new Date(b.date), 'dd/MM/yyyy'),
        b.purpose
      ]);

      autoTable(doc, {
        head: [['No', 'Nama Guru', 'Kelas', 'Waktu', 'Tarikh', 'Tujuan']],
        body: tableData,
        startY: startY + 15,
        theme: 'striped',
        headStyles: { 
          fillColor: [37, 99, 235], // Blue-600
          textColor: [255, 255, 255],
          fontSize: 10,
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 70 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 60 },
          4: { cellWidth: 30, halign: 'center' },
          5: { cellWidth: 'auto', halign: 'center' }
        },
        styles: {
          fontSize: 9,
          cellPadding: 4,
          valign: 'middle',
          font: 'helvetica'
        },
        margin: { left: 15, right: 15 }
      });

      doc.save(`Laporan_Tempahan_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (error) {
      console.error('PDF Generation failed:', error);
      alert('Gagal menjana laporan PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-slate-800">Muat Turun Laporan</h3>
            <p className="text-sm text-slate-500 mt-1">Jana laporan tempahan lengkap dalam format PDF (Landscape).</p>
            <div className="mt-4 flex gap-4">
              <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Jumlah Approved</p>
                <p className="text-lg font-bold text-slate-900">{confirmedBookings.length}</p>
              </div>
            </div>
          </div>
          
          <Button 
            onClick={generatePDF} 
            disabled={downloading || confirmedBookings.length === 0}
            className="h-14 px-8 gap-3 text-sm font-bold shadow-lg shadow-blue-100"
          >
            {downloading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <Plus className="w-5 h-5" /> 
            )}
            {downloading ? 'Sila Tunggu...' : 'Download Laporan PDF'}
          </Button>
        </div>

        {confirmedBookings.length === 0 && (
          <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <p className="text-xs text-amber-700 font-medium">Tiada tempahan yang telah diluluskan (Approved) untuk dipaparkan dalam laporan.</p>
          </div>
        )}
      </Card>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pratonton Data Laporan (Approved Sahaja)</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-white border-b border-slate-200">
                <th className="px-6 py-3 font-bold text-slate-400 uppercase tracking-widest w-12 text-center">No</th>
                <th className="px-6 py-3 font-bold text-slate-400 uppercase tracking-widest">Nama Guru</th>
                <th className="px-6 py-3 font-bold text-slate-400 uppercase tracking-widest text-center">Kelas</th>
                <th className="px-6 py-3 font-bold text-slate-400 uppercase tracking-widest">Waktu</th>
                <th className="px-6 py-3 font-bold text-slate-400 uppercase tracking-widest text-center">Tarikh</th>
                <th className="px-6 py-3 font-bold text-slate-400 uppercase tracking-widest">Tujuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {confirmedBookings.map((b, index) => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3 text-center font-mono text-slate-400">{index + 1}</td>
                  <td className="px-6 py-3 font-bold text-slate-800 uppercase">{b.teacherName}</td>
                  <td className="px-6 py-3 text-center font-bold text-blue-600">{b.className}</td>
                  <td className="px-6 py-3 text-slate-500 font-medium">{b.timeSlots?.join(', ')}</td>
                  <td className="px-6 py-3 text-center text-slate-500">{format(new Date(b.date), 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-3 text-slate-500 uppercase font-medium">{b.purpose}</td>
                </tr>
              ))}
              {confirmedBookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400 font-medium">Tiada data untuk dipaparkan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
