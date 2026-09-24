import { create } from 'zustand'

type Application = {
  id: string;
  name: string | null;
  destinationCountry: string;
  visaType: string;
};

interface ApplicationsState {
  applications: Application[];
  isLoaded: boolean;
  lastFetchedAt: number | null;
  setApplications: (apps: Application[]) => void;
}

export const useApplicationsStore = create<ApplicationsState>((set) => ({
  applications: [],
  isLoaded: false,
  lastFetchedAt: null,
  setApplications: (applications) => set({
    applications,
    isLoaded: true,
    lastFetchedAt: Date.now(),
  }),
}))
