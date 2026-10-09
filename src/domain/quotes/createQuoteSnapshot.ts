import type { ReturnTypeOfCurrentOrder } from "./quoteCalculation.types";
import type { Product } from "../../types/commercial";
import type { QuoteSnapshot } from "../../types/quote";
import type { QuoteCustomerSnapshot } from "../../types/customer";

export type QuoteSourceItem = {
  name: string;
  productIndex: string;
  paymentTermIndex: string;
  tableUnitPrice: number;
  quantity: number;
  weightKg: number;
  lineDiscountPercentage: number;
};

export type QuoteFreightContext = {
  tableName: string | null;
  zone: string | null;
  loadType: "fractional" | "closed" | null;
};

export type CreateQuoteSnapshotInput = {
  items: QuoteSourceItem[];
  calculation: ReturnTypeOfCurrentOrder;
  products: Product[];
  paymentTermLabels: readonly string[];
  anticipatedPayment: boolean;
  handlingRatePerTon: number;
  freight: QuoteFreightContext;
  customer?: QuoteCustomerSnapshot | null;
};

export function createQuoteSnapshot(input: CreateQuoteSnapshotInput): QuoteSnapshot {
  const anticipatedDiscountPercentage = input.anticipatedPayment ? 1.5 : 0;

  return {
    status: "draft",
    calculationVersion: "legacy-html-v1",
    customerId: input.customer?.id ?? null,
    customerName: input.customer?.name ?? null,
    customerDocument: input.customer?.document ?? null,
    priceTableId: null,
    discountTableId: null,
    freightTableId: null,
    handlingRateTableId: null,
    policyVersionId: null,
    anticipatedPayment: input.anticipatedPayment,
    anticipatedDiscountPercentage,
    freightTableName: input.freight.tableName,
    freightZone: input.freight.zone,
    loadType: input.freight.loadType,
    handlingRatePerTon: input.handlingRatePerTon,
    productSubtotal: input.calculation.productSubtotal,
    freightTotal: input.calculation.freightTotal,
    handlingTotal: input.calculation.handlingTotal,
    economyTotal: input.calculation.economyTotal,
    grandTotal: input.calculation.grandTotal,
    items: input.items.map((item, index) => {
      const calculated = input.calculation.items[index];
      const product = item.productIndex === "" ? undefined : input.products[Number(item.productIndex)];
      const paymentTerm = item.paymentTermIndex === ""
        ? null
        : input.paymentTermLabels[Number(item.paymentTermIndex)] ?? null;

      return {
        displayOrder: index,
        productId: null,
        paymentTermId: null,
        discountRuleId: null,
        productName: item.name,
        categoryName: product?.group ?? null,
        weightKg: item.weightKg,
        paymentTerm,
        tableUnitPrice: item.tableUnitPrice,
        quantity: item.quantity,
        lineDiscountPercentage: item.lineDiscountPercentage,
        anticipatedDiscountPercentage,
        totalDiscountPercentage: calculated.totalDiscountPercentage,
        finalUnitPrice: calculated.finalUnitPrice,
        economyPerUnit: calculated.economyPerUnit,
        freightPerUnit: calculated.freightPerBag,
        handlingPerUnit: calculated.handlingPerBag,
        productSubtotal: calculated.productSubtotal,
        freightSubtotal: calculated.freightTotal,
        handlingSubtotal: calculated.handlingTotal,
        total: calculated.productSubtotal + calculated.freightTotal + calculated.handlingTotal,
      };
    }),
  };
}
