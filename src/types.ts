export type PostType = 'issue' | 'explore';
export type PostStatus = 'open' | 'resolved';

export interface Post {
  id: string;
  type: PostType;
  title: string;
  description: string;
  image_url?: string;
  latitude: number;
  longitude: number;
  category: string;
  district?: string;
  status: PostStatus;
  upvotes: number;
  userId: string;
  createdAt: any; // ServerTimestamp
}

export interface Upvote {
  id: string; // userId_postId
  userId: string;
  postId: string;
  createdAt: any;
}

export interface BOQItem {
  material: string;
  estimatedCost: number;
}

export interface TenderProject {
  id: string;
  tenderId: string;
  title: string;
  department: string;
  district: string;
  sanctionedAmount: number;
  finalAwardAmount: number | null;
  winningContractorId: string | null;
  status: 'open' | 'awarded' | 'completed';
  location: {
    latitude: number;
    longitude: number;
  };
  publicationDate: string;
  closingDate: string;
  boqSummary: BOQItem[];
  pdfUrl: string;
  summary?: string;
}

export interface Contractor {
  id: string;
  companyName: string;
  cinNumber: string;
  classRating: string;
  totalWonValue: number;
  activeProjectsCount: number;
}

