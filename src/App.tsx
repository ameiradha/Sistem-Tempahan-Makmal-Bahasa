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
  orderBy
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
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
import { UserProfile, Booking, BookingStatus, Lab, AppSettings, TIME_SLOTS, TEACHERS, CLASSES, PURPOSES } from './types';

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
          telegramChatId: ''
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
            <div className="hidden sm:flex items-center px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-100 text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
              Tersedia
            </div>
            <div className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-6 flex-1 overflow-y-auto bg-slate-50/50">
          <div className="max-w-6xl mx-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <DashboardView profile={profile} bookings={bookings} />
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
                  <AdminPanelView bookings={bookings} settings={settings} labs={labs} />
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

function DashboardView({ profile, bookings }: { profile: UserProfile, bookings: Booking[] }) {
  const stats = {
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    total: bookings.length
  };

  return (
    <div className="space-y-6">
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
        
        {bookings.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-100 rounded-xl p-10 text-center text-slate-400 text-sm font-medium">
            Tiada data tempahan ditemui makmal kali ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookings.slice(0, 6).map(booking => (
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

function CalendarView({ labs, bookings, profile, settings }: { labs: Lab[], bookings: Booking[], profile: UserProfile, settings: AppSettings }) {
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

        <Card className="p-4 bg-white border-l-4 border-l-blue-600">
          <div className="mb-6">
            <h3 className="font-bold text-sm text-slate-800">{format(selectedDay, 'eeee, dd MMM')}</h3>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tight">Slot Makmal: {selectedLab?.name}</p>
          </div>

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
                  {!booking && isAllowable && (
                    <Button size="sm" variant="outline" className="h-7 py-0 px-2 text-[10px] border-blue-400 text-blue-600" onClick={() => setIsBookingModalOpen(true)}>Tempah</Button>
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
  settings 
}: { 
  lab: Lab, 
  date: Date, 
  onClose: () => void, 
  profile: UserProfile,
  existingBookings: Booking[],
  settings: AppSettings
}) {
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);

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

      await addDoc(collection(db, 'bookings'), bookingData);

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
            parse_mode: 'Markdown'
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
                <option value="">-- Pilih Nama --</option>
                {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
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

function AdminPanelView({ bookings, settings, labs }: { bookings: Booking[], settings: AppSettings, labs: Lab[] }) {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');
  const [adminTab, setAdminTab] = useState<'approvals' | 'settings'>('approvals');

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

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto -mx-1 p-1">
        <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl w-fit whitespace-nowrap">
          <button 
            onClick={() => setAdminTab('approvals')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              adminTab === 'approvals' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Pengesahan
          </button>
          <button 
            onClick={() => setAdminTab('settings')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              adminTab === 'settings' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Tetapan Sistem
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {adminTab === 'approvals' ? (
          <motion.div key="approvals" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <AdminApprovalsView bookings={bookings} />
          </motion.div>
        ) : (
          <motion.div key="settings" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
            <AdminSettingsView settings={settings} labs={labs} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminApprovalsView({ bookings }: { bookings: Booking[] }) {
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
    </div>
  );
}

function EditBookingModal({ 
  booking, 
  onClose 
}: { 
  booking: Booking, 
  onClose: () => void 
}) {
  const [selectedSlots, setSelectedSlots] = useState<string[]>(booking.timeSlots || []);
  const [teacherName, setTeacherName] = useState(booking.teacherName || '');
  const [className, setClassName] = useState(booking.className || '');
  const [purpose, setPurpose] = useState(booking.purpose || '');
  const [loading, setLoading] = useState(false);

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
                <option value="">-- Pilih Nama --</option>
                {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
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

function AdminSettingsView({ settings, labs }: { settings: AppSettings, labs: Lab[] }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

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
      // Save global public settings
      await setDoc(doc(db, 'settings', 'global'), {
        systemName: form.systemName,
        systemDescription: form.systemDescription,
        logoUrl: form.logoUrl
      });
      
      // Save security settings if changed
      const securityUpdate: any = {};
      if (form.adminPassword) securityUpdate.password = form.adminPassword;

      if (Object.keys(securityUpdate).length > 0) {
        await setDoc(doc(db, 'settings', 'security'), securityUpdate);
      }

      // Save telegram settings to global
      const globalUpdate = {
        systemName: form.systemName,
        systemDescription: form.systemDescription,
        logoUrl: form.logoUrl,
        telegramBotToken: form.telegramBotToken || '',
        telegramChatId: form.telegramChatId || ''
      };
      await setDoc(doc(db, 'settings', 'global'), globalUpdate);
      
      alert('Tetapan berjaya disimpan!');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan tetapan.');
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl">
      <Card className="p-8">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6 border-b border-slate-100 pb-3 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-slate-400" /> Konfigurasi Sistem
        </h3>
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
              <p className="text-[9px] text-slate-400 font-medium italic">
                Dapatkan Bot Token melalui @BotFather dan Chat ID melalui @userinfobot di Telegram.
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
