export type EmployeeStatus = "active" | "inactive";

export type UserStatus = "active" | "disabled";

export type EmployeeRole = "owner" | "manager" | "supervisor" | "teller";

export interface EmployeeRecord {
  id: string;
  business_id: string;
  user_id: string;
  employee_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: EmployeeStatus;
  created_at: string;
  username: string;
  user_status: UserStatus;
}

export interface EmployeeBranch {
  id: string;
  name: string;
  code: string;
  isHeadquarters: boolean;
  isPrimary: boolean;
}

export interface EmployeeListItem {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  username: string;
  status: EmployeeStatus;
  roles: EmployeeRole[];
  branches: EmployeeBranch[];
  createdAt: string;
}

export interface EmployeeDetails extends EmployeeListItem {
  userId: string;
}

export interface CreateEmployeeInput {
  fullName: string;
  username: string;
  password: string;
  email?: string;
  phone?: string;
  role: EmployeeRole;
  branchIds: string[];
  primaryBranchId: string;
}

export interface UpdateEmployeeInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
}

export interface AssignEmployeeRolesInput {
  roles: EmployeeRole[];
}

export interface AssignEmployeeBranchesInput {
  branchIds: string[];
  primaryBranchId: string;
}

export interface ResetEmployeePasswordInput {
  password: string;
}
