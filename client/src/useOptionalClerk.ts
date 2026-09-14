import { useUser, useAuth, useClerk } from '@clerk/clerk-react';

// Whether ClerkProvider is mounted is decided once in main.tsx from this
// same env var, and it can't change at runtime -- so this branch is stable
// across a component's renders and doesn't violate the rules of hooks.
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function useOptionalClerk() {
  if (!CLERK_ENABLED) {
    return {
      isLoaded: true,
      isSignedIn: false,
      user: null as null,
      getToken: async () => null as string | null,
      signOut: () => {},
    };
  }
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  return { isLoaded, isSignedIn, user, getToken, signOut };
}
