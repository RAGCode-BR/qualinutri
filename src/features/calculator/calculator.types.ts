import type { CurrentOrderItem, LoadType } from "../../domain";

export type OrderItem = CurrentOrderItem & {
  id: number;
  productIndex: string;
  paymentTermIndex: string;
  discountLineIndex: string;
  customDiscountPercentage: number;
  /** Categoria do produto no momento em que o item foi adicionado. */
  categoryName?: string | null;
};

export type ItemFormState = {
  productIndex: string;
  paymentTermIndex: string;
  tableUnitPrice: string;
  discountLineIndex: string;
  customDiscountPercentage: string;
  quantity: string;
  bagWeightKg: string;
};

export type FreightFormState = {
  table: "" | "juara" | "regional";
  rangeIndex: string;
  loadType: LoadType;
};
