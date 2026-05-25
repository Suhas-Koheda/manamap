export interface TenderProject {
  id: string;
  title: string;
  department: string;
  district: string;
  tenderValue: number;
  closingDate: string | null;
  publicationDate: string | null;
  status: 'open' | 'awarded' | 'completed';
  pdfUrl: string | null;
  rawPayload?: any;
  location: {
    latitude: number;
    longitude: number;
  };
}

export interface District {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Department {
  id: string;
  name: string;
  code: string;
}
