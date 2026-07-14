import { prisma } from '../prisma';

// Business rule: one account is EITHER a driver OR a company member,
// never both. Drivers carry every company's parcels and see
// cross-company customer data on their routes -- a dual-role account is
// a conflict of interest (self-dealing, competitor visibility). Enforced
// at every door: driver application, company registration, admin role
// grants, and admin driver creation.

// "Live" = anything not REJECTED: an applicant awaiting review counts
// (they've declared the intent), a rejected applicant was turned away
// and may take the company path instead.
export async function hasLiveDriverRecord(userId: string): Promise<boolean> {
  const driver = await prisma.collectUkDriver.findUnique({ where: { userId } });
  return Boolean(driver && driver.status !== 'REJECTED');
}

export async function isCompanyMember(userId: string): Promise<boolean> {
  const role = await prisma.collectUkCompanyRole.findFirst({ where: { userId } });
  return Boolean(role);
}

export const DRIVER_BLOCKS_COMPANY =
  'Driver accounts cannot manage a shipping company -- drivers serve every company, so the roles must stay separate. Use a different account.';
export const COMPANY_BLOCKS_DRIVER =
  "Company members cannot drive for Faira -- drivers serve every company, so the roles must stay separate. Use a different account to apply.";
