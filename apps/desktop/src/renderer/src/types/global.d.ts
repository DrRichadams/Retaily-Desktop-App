export {};

interface RetailyUser {
  id: string;
  username: string;
  employeeId: string;
  businessId: string;
  fullName: string;
}

interface RetailyAuthContext {
  userId: string;
  username: string;
  employeeId: string;
  businessId: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

interface RetailyAPI {
  getVersion(): Promise<string>;

  getServerHealth(): Promise<{
    status: string;
    message?: string;
    application?: string;
    service?: string;
    database?: string;
    schemaVersion?: number;
    onboardingRequired?: boolean;
    timestamp?: string;
  }>;

  login(credentials: { username: string; password: string }): Promise<{
    success: boolean;
    expiresAt: string;
    user: RetailyUser;
  }>;

  getCurrentUser(): Promise<RetailyAuthContext>;

  getOnboardingStatus(): Promise<{
    required: boolean;
  }>;

  logout(): Promise<{
    success: boolean;
  }>;

  createOwner(details: {
    businessName: string;
    ownerName: string;
    username: string;
    password: string;
    email?: string;
    phone?: string;
    branchName: string;
    branchCode: string;
    registerName: string;
    registerCode: string;
    currency: string;
  }): Promise<{
    success: boolean;
    businessId: string;
    branchId: string;
    registerId: string;
    ownerId: string;
  }>;
}

declare global {
  interface Window {
    retaily: RetailyAPI;
  }
}
