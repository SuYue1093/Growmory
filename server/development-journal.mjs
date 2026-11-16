import { z } from "zod";

export const journalDate = z.string().date();
export const journalNote = z.string().trim().min(1).max(2000);
export const journalArticle = {
  title: z.string().trim().min(1).max(200),
  platform: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(30000),
};

const base = { id: z.string().min(1), date: journalDate, createdAt: z.string().datetime() };
export const journalEntries = z.array(z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("note"), text: journalNote }).strict(),
  z.object({ ...base, kind: z.literal("draft"), ...journalArticle, updatedAt: z.string().datetime() }).strict(),
]));
