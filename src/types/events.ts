// One entry of brands.json
export type BrandEntry = {
  brand_id: string;
  currency: string;
};

// One line of a brand_XX.ndjson file, as documented in the spec
export type RawEvent = {
  event_id: string;
  brand_id: string;
  user_id: string;
  event_type: string;
  customer_type: string | null;
  received_at: string;
  properties: Record<string, unknown>;
};

// A purchase event ready to be stored in purchase_events (Table A)
export type PurchaseEventRow = {
  eventId: string;
  brandId: string;
  userId: string;
  eventType: string;
  customerType: string;
  receivedAt: Date;
  orderId: string;
  // decimal string, e.g. "723.99"
  amount: string;
};
