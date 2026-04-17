import { create } from 'zustand';

export type HouseholdProfile = 'house' | 'kids' | 'family' | 'adult';

interface HouseholdProfileState {
    profile: HouseholdProfile;
    pin: string;
    setProfile: (profile: HouseholdProfile) => void;
    verifyPin: (pin: string) => boolean;
    updatePin: (pin: string) => void;
}

const STORAGE_KEY = 'streamforge-household-profile';
const PIN_STORAGE_KEY = 'streamforge-household-pin';

const getInitialProfile = (): HouseholdProfile => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'kids' || stored === 'family' || stored === 'adult' || stored === 'house') {
        return stored;
    }
    return 'house';
};

const getInitialPin = () => {
    const stored = localStorage.getItem(PIN_STORAGE_KEY);
    if (stored && stored.trim().length >= 4) return stored;
    localStorage.setItem(PIN_STORAGE_KEY, '1234');
    return '1234';
};

export const useHouseholdProfileStore = create<HouseholdProfileState>((set, get) => ({
    profile: getInitialProfile(),
    pin: getInitialPin(),
    setProfile: (profile) => {
        localStorage.setItem(STORAGE_KEY, profile);
        set({ profile });
    },
    verifyPin: (pin) => pin === get().pin,
    updatePin: (pin) => {
        localStorage.setItem(PIN_STORAGE_KEY, pin);
        set({ pin });
    },
}));
