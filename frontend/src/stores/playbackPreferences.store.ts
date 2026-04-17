import { create } from 'zustand';

interface PlaybackPreferencesState {
  preferPortugueseAudio: boolean;
  acceptPortugueseSubtitles: boolean;
  setPreferPortugueseAudio: (value: boolean) => void;
  setAcceptPortugueseSubtitles: (value: boolean) => void;
}

const STORAGE_KEY = 'streamforge-playback-preferences';

const readInitialState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        preferPortugueseAudio: true,
        acceptPortugueseSubtitles: true,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      preferPortugueseAudio: parsed.preferPortugueseAudio !== false,
      acceptPortugueseSubtitles: parsed.acceptPortugueseSubtitles !== false,
    };
  } catch {
    return {
      preferPortugueseAudio: true,
      acceptPortugueseSubtitles: true,
    };
  }
};

const persist = (state: Pick<PlaybackPreferencesState, 'preferPortugueseAudio' | 'acceptPortugueseSubtitles'>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const initialState = readInitialState();

export const usePlaybackPreferencesStore = create<PlaybackPreferencesState>((set, get) => ({
  preferPortugueseAudio: initialState.preferPortugueseAudio,
  acceptPortugueseSubtitles: initialState.acceptPortugueseSubtitles,
  setPreferPortugueseAudio: (value: boolean) => {
    set({ preferPortugueseAudio: value });
    const { acceptPortugueseSubtitles } = get();
    persist({ preferPortugueseAudio: value, acceptPortugueseSubtitles });
  },
  setAcceptPortugueseSubtitles: (value: boolean) => {
    set({ acceptPortugueseSubtitles: value });
    const { preferPortugueseAudio } = get();
    persist({ preferPortugueseAudio, acceptPortugueseSubtitles: value });
  },
}));
