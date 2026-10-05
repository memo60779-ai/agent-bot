export type UserRole = 'customer' | 'provider' | 'admin';
export type RequestStatus =
  | 'NEW' | 'MATCHING' | 'ACCEPTED' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'RATED';
export type VerificationStatus = 'unverified' | 'pending' | 'needs_info' | 'verified' | 'rejected';
export type OfferStatus = 'offered' | 'accepted' | 'declined' | 'cancelled' | 'withdrawn';
export type TimeSlot = 'now' | 'today' | 'tomorrow' | 'scheduled';
export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'rejected';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  province: string;
  city: string | null;
  area: string | null;
  is_active: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  slug: string;
  name_ar: string;
  icon: string;
  description_ar: string | null;
  problem_types: string[];
  sort_order: number;
  is_active: boolean;
}

export interface Provider {
  id: string;
  display_name: string;
  avatar_url: string | null;
  service_id: string;
  years_experience: number;
  bio: string;
  province: string;
  city: string;
  area: string;
  lat: number | null;
  lng: number | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
  is_available: boolean;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  is_demo: boolean;
  /** short public number for the share link /p/<code> */
  public_code: number;
  created_at: string;
  services?: Pick<Service, 'id' | 'slug' | 'name_ar' | 'icon'> | null;
}

export interface PortfolioItem {
  id: string;
  provider_id: string;
  image_url: string;
  caption: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface ServiceRequest {
  id: string;
  customer_id: string;
  service_id: string;
  problem_type: string;
  description: string;
  photo_path: string | null;
  province: string;
  city: string;
  area: string;
  address_details: string | null;
  lat: number | null;
  lng: number | null;
  time_slot: TimeSlot;
  scheduled_at: string | null;
  status: RequestStatus;
  provider_id: string | null;
  cancel_reason: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  /** promised arrival (provider picks it when leaving) */
  eta_at: string | null;
  on_the_way_at: string | null;
  arrived_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  services?: Pick<Service, 'id' | 'slug' | 'name_ar' | 'icon'> | null;
  providers?: Pick<Provider, 'id' | 'display_name' | 'avatar_url' | 'rating_avg' | 'is_demo'> | null;
}

export interface OfferRow {
  id: string;
  request_id: string;
  provider_id: string;
  status: OfferStatus;
  responded_at: string | null;
  created_at: string;
  providers?: Pick<Provider, 'id' | 'display_name' | 'avatar_url' | 'rating_avg' | 'rating_count' | 'area' | 'is_demo'> | null;
  service_requests?: ServiceRequest | null;
}

export interface Review {
  id: string;
  request_id: string;
  provider_id: string;
  customer_id: string;
  customer_name: string;
  rating: number;
  rating_punctuality: number | null;
  rating_quality: number | null;
  rating_behavior: number | null;
  rating_price: number | null;
  comment: string | null;
  is_hidden: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface VerificationRequest {
  id: string;
  provider_id: string;
  document_path: string;
  provider_note: string | null;
  status: VerificationStatus;
  admin_notes: string | null;
  reviewed_at: string | null;
  is_demo: boolean;
  created_at: string;
  providers?: Pick<Provider, 'id' | 'display_name' | 'city' | 'area' | 'years_experience' | 'is_demo'> & {
    services?: Pick<Service, 'name_ar'> | null;
  } | null;
}

export interface Complaint {
  id: string;
  request_id: string;
  customer_id: string;
  provider_id: string | null;
  subject: string;
  details: string;
  status: ComplaintStatus;
  admin_notes: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MatchRow {
  provider_id: string;
  display_name: string;
  avatar_url: string | null;
  city: string;
  area: string;
  years_experience: number;
  is_available: boolean;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  is_demo: boolean;
  same_area: boolean;
  same_city: boolean;
  distance_km: number | null;
  offer_status: OfferStatus | null;
}

export interface Contacts {
  customer_name: string | null;
  customer_phone: string | null;
  provider_name: string | null;
  provider_phone: string | null;
  address_details: string | null;
  /** exact pin: customer always; provider only after accepting */
  lat: number | null;
  lng: number | null;
}
