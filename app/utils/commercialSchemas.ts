import { z } from "zod";

export const moneySchema = z.number().finite().nonnegative();

export const commercialMonthSchema = z.object({
  month: z.string().min(1),
  monthNumber: z.number().int().min(1).max(12),
  target: moneySchema,
  sold: moneySchema,
  adjusted: moneySchema,
  adjustmentRate: z.number().finite(),
  gap: z.number().finite(),
  attainment: z.number().finite(),
  health: z.string().min(1),
});

export const bitrixDealSchema = z.object({
  id: z.union([z.string().min(1), z.number().int().positive()]),
  company: z.string().min(1),
  owner: z.string().min(1),
  sold: moneySchema,
  adjusted: moneySchema,
  contractSigned: z.boolean(),
});

export type CommercialMonth = z.infer<typeof commercialMonthSchema>;
export type BitrixDeal = z.infer<typeof bitrixDealSchema>;
