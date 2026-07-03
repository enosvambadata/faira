import React, { createContext, useContext, useState } from 'react';
import { DEFAULT_CITY } from '@/data/cities';

interface OnboardingContextValue {
  city: string;
  setCity: (city: string) => void;
  interests: string[];
  toggleInterest: (id: string) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [interests, setInterests] = useState<string[]>([]);

  const toggleInterest = (id: string) => {
    setInterests(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id],
    );
  };

  return (
    <OnboardingContext.Provider value={{ city, setCity, interests, toggleInterest }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
