import type { ComplaintStatus, OfferStatus, RequestStatus, TimeSlot, VerificationStatus } from './types';

// Launch scope: Karbala only. Other provinces appear as "قريباً".
export const PROVINCE = 'كربلاء';
export const UPCOMING_PROVINCES = ['بغداد', 'النجف', 'بابل'];

// Edit freely — these are plain strings stored on requests/providers.
export const CITIES: Record<string, string[]> = {
  'كربلاء': [
    'حي الحسين', 'حي العباس', 'حي البلدية', 'حي الموظفين', 'حي النقيب', 'حي رمضان', 'حي العامل',
    'حي الغدير', 'حي المعلمين', 'حي الأسرة', 'حي الملحق', 'حي الإسكان', 'حي النصر', 'حي الحر',
    'حي الزهراء', 'حي الجاير', 'سيف سعد', 'باب بغداد', 'باب الخان', 'باب طويريج', 'المخيم',
    'العباسية الشرقية', 'العباسية الغربية',
  ],
  'الهندية (طويريج)': ['الهندية', 'حي الحسين - الهندية', 'حي العسكري - الهندية'],
  'الحر': ['الحر'],
  'الحسينية': ['الحسينية'],
  'عين التمر': ['عين التمر'],
};
export const CITY_NAMES = Object.keys(CITIES);

export const STATUS_LABEL: Record<RequestStatus, string> = {
  NEW: 'جديد',
  MATCHING: 'ندوّرلك فني',
  ACCEPTED: 'الفني وافق',
  ON_THE_WAY: 'الفني بالطريق',
  IN_PROGRESS: 'الشغل بدأ',
  COMPLETED: 'اكتمل',
  CANCELLED: 'ملغي',
  RATED: 'تم التقييم',
};

export const STATUS_TONE: Record<RequestStatus, 'gray' | 'blue' | 'orange' | 'green' | 'red'> = {
  NEW: 'gray',
  MATCHING: 'orange',
  ACCEPTED: 'blue',
  ON_THE_WAY: 'blue',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'red',
  RATED: 'green',
};

export const STATUS_FLOW: RequestStatus[] = ['MATCHING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'RATED'];

export const OFFER_LABEL: Record<OfferStatus, string> = {
  offered: 'بانتظار رد الفني',
  accepted: 'وافق',
  declined: 'اعتذر',
  cancelled: 'ملغي',
  withdrawn: 'انسحب',
};

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  now: 'هسه (مستعجل)',
  today: 'اليوم',
  tomorrow: 'باچر',
  scheduled: 'موعد محدد',
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  unverified: 'غير موثق',
  pending: 'بانتظار المراجعة',
  needs_info: 'مطلوب معلومات إضافية',
  verified: 'موثق',
  rejected: 'مرفوض',
};

export const COMPLAINT_LABEL: Record<ComplaintStatus, string> = {
  open: 'مفتوحة',
  in_review: 'قيد المتابعة',
  resolved: 'محلولة',
  rejected: 'مرفوضة',
};

export const REVIEW_ASPECTS = [
  { key: 'rating_punctuality', label: 'الالتزام بالوقت' },
  { key: 'rating_quality', label: 'جودة الشغل' },
  { key: 'rating_behavior', label: 'التعامل' },
  { key: 'rating_price', label: 'السعر' },
] as const;
