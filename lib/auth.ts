// Simple auth utility for managing user authentication
// In production, this would be replaced with proper authentication

const USER_EMAIL_KEY = 'dartworks-user-email';

export function getUserEmail(): string | null {
  if (typeof window === 'undefined') {
    // Server-side: return null (shouldn't happen in client components)
    return null;
  }
  
  return localStorage.getItem(USER_EMAIL_KEY);
}

// For backward compatibility, getUserId returns email
export function getUserId(): string | null {
  return getUserEmail();
}

export function setUserEmail(email: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_EMAIL_KEY, email);
  }
}

export function clearUserId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_EMAIL_KEY);
  }
}

export function isLoggedIn(): boolean {
  return getUserEmail() !== null;
}

// Legacy function for onboarding - creates a temporary user ID
// This will be replaced when user completes onboarding
export function createUserId(): string {
  if (typeof window === 'undefined') {
    throw new Error('Cannot create user ID on server side');
  }
  
  // Generate a unique temporary user ID for onboarding
  const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem(USER_EMAIL_KEY, userId);
  return userId;
}

