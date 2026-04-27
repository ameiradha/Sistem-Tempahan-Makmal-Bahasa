export type UserRole = 'teacher';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AppSettings {
  systemName: string;
  systemDescription: string;
  logoUrl: string;
  adminPassword?: string; // Optional for transfer between components
}

export type BookingStatus = 'pending' | 'confirmed' | 'rejected';

export interface Booking {
  id: string;
  labId: string;
  labName: string;
  date: string; // ISO date string
  timeSlots: string[]; // Changed from single timeSlot to array of slots
  userId: string;
  userName: string;
  teacherName: string; // Added predefined teacher name
  className: string; // Added class
  purpose: string; // Added purpose
  status: BookingStatus;
  reason?: string;
  createdAt: any; // Firestore Timestamp
}

export interface Lab {
  id: string;
  name: string;
  capacity?: number;
  description?: string;
}

export const TIME_SLOTS = [
  "07:00 - 07:30",
  "07:30 - 08:00",
  "08:00 - 08:30",
  "08:30 - 09:00",
  "09:00 - 09:30",
  "09:30 - 10:00",
  "10:00 - 10:30",
  "10:30 - 11:00",
  "11:00 - 11:30",
  "11:30 - 12:00",
  "12:00 - 12:30",
  "12:30 - 13:00",
  "14:00 - 14:30",
  "14:30 - 15:00",
  "15:00 - 15:30",
  "15:30 - 16:00",
  "16:00 - 16:30",
  "16:30 - 17:00"
];

export const TEACHERS = [
  "HAMDI BIN NAJDI",
  "LAM KAH SOON",
  "MOHAMAD RAMOS BIN MUSTAPHA",
  "JAMALLUDIN BIN JERAEE@ JURIT",
  "AMEIR DANIEL HAKIEM BIN AZMI",
  "AQILAH BINTI MOHAMMAD SHA’ARI",
  "CHRISTINA TELESAI ANAK JOSEPH MAUH",
  "CORINA ANAK RENGGIAN",
  "DAYANG JAMAYAH BINTI AWANG AZMAN",
  "DORENCE ANAK JULIUS TUNGKIONG",
  "DORIS NURULAIN JAMES NGALAYANG",
  "HASINAH KHAN BINTI NISAR",
  "HENNY IRAWATY BINTI IBRAHIM",
  "HOO KIONG",
  "KHAIRUNNISA’ MADIHAH BINTI ABDUL RAHIM",
  "KOH WEI WEI",
  "KONG AI LING",
  "LAU ENG ENG",
  "LIM JIA LIH",
  "LING SIEW SIEW",
  "MAIMON BINTI RAHIM",
  "MARISSA MARTHA ABDULLAH",
  "MEGAWATI BINTI SALLEH",
  "MERINI ANAK PRIA",
  "MOHAMAD ERWAN BIN ALIM",
  "MOHAMAD SHADON BIN WAHAB",
  "MOHD FADHLAN ABDULLAH",
  "MUNICA ANAK NIAMBANG",
  "NOOR SHAHIDA BINTI SHAFIE",
  "NOORAZLINA BTE BOLHASSAN",
  "NOORBAIZURA BINTI SARAKAWI",
  "NORMAH BINTI RAWI",
  "NURAISHAH BINTI SHAHFRI",
  "NURATIQAH BINTI MOHD SAID",
  "NURUL NABILAH BINTI ABDUL HALIM",
  "RAHIMAH BINTI IBRAHIM",
  "RAMALAH BINTI YUSUF",
  "RITA WONG SIAO ING",
  "ROHANA BINTI ISMAIL",
  "ROSMAH BINTI JOHREE",
  "ROSMAWATI BINTI CHENG",
  "THOMAS CHIEW SENG KAI",
  "TING YENG NI",
  "WAHYUNI BINTI ESAEH @ISHA",
  "WAN MOHD LUKMANUL HAKIM BIN WAN MAZLI"
];

export const CLASSES = [
  "1A", "1C", "1D",
  "2A", "2C", "2D",
  "3A", "3C", "3D",
  "4A", "4C", "4D",
  "5A", "5C", "5D",
  "6A", "6C", "6D"
];

export const PURPOSES = [
  "PDPC",
  "PENCERAPAN",
  "KURSUS",
  "LATIHAN",
  "LAIN-LAIN"
];
