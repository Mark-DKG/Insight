import { z } from "zod";

// Shape of the seller application form (StoreSellerApplication.data).
const str = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const ApplicationData = z.object({
  registeredName: str(160),
  tradingName: str(160),
  registrationNumber: str(80),
  businessType: str(80),
  description: str(2000),
  address: str(300),
  city: str(80),
  region: str(80),
  country: str(80),
  phone: str(40),
  email: z.string().trim().email("Enter a valid business email.").max(160).optional().or(z.literal("")),
  repName: str(120),
  repPosition: str(80),
  repPhone: str(40),
  repEmail: z.string().trim().email("Enter a valid representative email.").max(160).optional().or(z.literal("")),
  categories: z.array(z.string().trim().max(80)).max(20).optional(),
  productCount: str(40),
  physicalPresence: z.boolean().optional(),
  shopAddress: str(300),
  onlinePresence: str(300),
  fulfilment: str(300),
  offersDelivery: z.boolean().optional(),
  offersCollection: z.boolean().optional(),
}).strict();

export type ApplicationDataT = z.infer<typeof ApplicationData>;

export const FIELD_LABELS: Record<string, string> = {
  registeredName: "Registered business name", businessType: "Business type", description: "Business description",
  address: "Business address", city: "City", region: "Region", country: "Country", phone: "Contact phone",
  email: "Business email", repName: "Representative's full name", repPosition: "Representative's position",
  repPhone: "Representative's contact number", repEmail: "Representative's email", categories: "Product categories",
  productCount: "Approximate number of products", fulfilment: "Order fulfilment method",
};
