import { CompanyRequest } from '../middleware/requireCompanyRole';

// Mirrors isAssignedToHub -- usable once the target company is only known
// after loading a record (e.g. a warehouse's companyId), not present in
// the URL params up front.
export function isAssignedToCompany(req: CompanyRequest, companyId: string): boolean {
  return (req.companyRoles ?? []).some(r => r.companyId === companyId);
}
