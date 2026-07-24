import { z } from 'zod';

// E.164 phone validation, shared across Vamba Collect booking/shipment inputs.
// (The marketplace API keeps its own copy in routes/auth.ts — deliberately
// decoupled rather than shared, per the product split.)
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +263771234567');
