import { z } from "zod";

const PAN_REGEX = /(?<!\d)(?:\d[\s-]*){13,19}(?!\d)/;

export const loginSchema = z.object({
  email: z.string().email("יש להזין כתובת אימייל תקינה"),
  password: z.string().min(1, "יש להזין סיסמה"),
});

export const registerSchema = z.object({
  full_name: z
    .string()
    .min(2, "שם מלא חייב להכיל לפחות 2 תווים")
    .max(80, "שם מלא ארוך מדי"),
  email: z.string().email("יש להזין כתובת אימייל תקינה"),
  password: z
    .string()
    .min(10, "הסיסמה חייבת להכיל לפחות 10 תווים")
    .max(128, "הסיסמה ארוכה מדי"),
});

export const dealSearchSchema = z.object({
  query: z.string().min(2, "הזן לפחות 2 תווים לחיפוש").max(200),
  max_budget_ils: z.number().positive("תקציב חייב להיות חיובי").optional(),
  override_ship_to: z.string().length(2).optional(),
  use_saved_profile: z.boolean().default(true),
});

export const cartItemSchema = z.object({
  sku: z.string().min(1, "נדרש מק״ט"),
  title: z.string().min(1, "נדרש שם מוצר"),
  store_name: z.string().min(1, "נדרש שם חנות"),
  unit_price_usd: z.number().positive("מחיר יחידה חייב להיות גדול מ-0"),
  quantity: z.number().int().min(1, "כמות מינימלית היא 1"),
});

export const cartSplitSchema = z.object({
  store_name: z.string().min(1, "יש להזין שם חנות"),
  items: z.array(cartItemSchema).min(2, "יש להזין לפחות 2 פריטים לבדיקת פיצול"),
  shipping_per_package_usd: z.number().min(0),
  free_shipping_threshold_usd: z.number().min(0).nullable().optional(),
  ship_to_country: z.string().length(2).default("IL"),
});

export const profileUpdateSchema = z.object({
  preferred_currency: z.enum(["ILS", "USD", "EUR"]),
  ship_to_country: z.string().length(2, "קוד מדינה בן 2 אותיות"),
  credit_card_clubs: z
    .array(z.string())
    .refine(
      (clubs) => clubs.every((c) => !PAN_REGEX.test(c)),
      "יש להזין שמות מועדונים בלבד, לעולם לא מספר כרטיס אשראי!",
    ),
  preferred_stores: z.array(z.string()),
  min_seller_trust: z.number().int().min(50).max(100),
  notification_channels: z.array(z.enum(["email", "telegram", "slack"])).min(1),
  telegram_chat_id: z.string().nullable().optional(),
  long_term_preferences: z
    .object({
      official_warranty_only: z.boolean().optional(),
      max_delivery_days: z.number().int().min(1).max(60).optional(),
    })
    .optional(),
});
