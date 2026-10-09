import { useEffect, useMemo, useRef, useState } from "react";
import { useCommercialData } from "../../app/CommercialDataProvider";
import {
  calculateCurrentOrder,
  type FreightSelection,
} from "../../domain";
import type { FreightFormState, ItemFormState, OrderItem } from "./calculator.types";
import { quoteToCalculatorState } from "./quoteToCalculatorState";
import { remapCatalogSelections } from "./remapCatalogSelections";
import type { SavedQuoteDetail } from "../../services/quoteService";

/** Orçamento salvo aberto para edição na calculadora. */
export type EditingQuote = {
  id: string;
  number: number;
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerDocument: string | null;
};

const initialItemForm: ItemFormState = {
  productIndex: "",
  paymentTermIndex: "",
  tableUnitPrice: "",
  discountLineIndex: "",
  customDiscountPercentage: "",
  quantity: "1",
  bagWeightKg: "30",
};

const initialFreightForm: FreightFormState = {
  table: "",
  rangeIndex: "",
  loadType: "fractional",
};

function numberOrZero(value: string) {
  return Number.parseFloat(value) || 0;
}

export function useCalculator() {
  const { data } = useCommercialData();
  const { discountLines, juaraFreightRates, products, regionalFreightRates } = data;
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);
  const [freightForm, setFreightForm] = useState<FreightFormState>(initialFreightForm);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [anticipatedPayment, setAnticipatedPayment] = useState(false);
  const [handlingEnabled, setHandlingEnabled] = useState(false);
  const [handlingRatePerTon, setHandlingRatePerTon] = useState(String(data.handlingRatePerTon));
  const [editingQuote, setEditingQuote] = useState<EditingQuote | null>(null);
  const nextId = useRef(1);
  const previousCatalog = useRef(data);

  // O catálogo pode ser atualizado com a calculadora aberta: as seleções são
  // reencontradas pelo nome para não apontarem para outro produto ou linha.
  useEffect(() => {
    const previous = previousCatalog.current;
    previousCatalog.current = data;
    if (previous === data) return;
    setItems((current) => remapCatalogSelections(previous, data, current, initialItemForm).items);
    setItemForm((current) => remapCatalogSelections(previous, data, [], current).itemForm);
  }, [data]);

  const freightSelection = useMemo<FreightSelection>(() => {
    if (freightForm.table === "juara") {
      const rate = juaraFreightRates[Number(freightForm.rangeIndex)];
      if (!rate) return { table: "none" };
      return {
        table: "juara",
        loadType: freightForm.loadType,
        rates: {
          bag25: rate.bag25,
          bag30: rate.bag30,
          bag40: rate.bag40,
          closedPerTon: rate.closedPerTon,
        },
      };
    }

    if (freightForm.table === "regional") {
      const rate = regionalFreightRates[Number(freightForm.rangeIndex)];
      if (!rate) return { table: "none" };
      return {
        table: "regional",
        loadType: freightForm.loadType,
        rates: {
          fractionalPerTon: rate.fractionalPerTon,
          closedPerTon: rate.closedPerTon,
        },
      };
    }

    return { table: "none" };
  }, [freightForm]);

  const calculation = useMemo(
    () => calculateCurrentOrder(items, {
      anticipatedPayment,
      freight: freightSelection,
      handlingEnabled,
      handlingRatePerTon: numberOrZero(handlingRatePerTon),
    }),
    [anticipatedPayment, freightSelection, handlingEnabled, handlingRatePerTon, items],
  );

  function fillProductPrice(nextForm: ItemFormState) {
    if (nextForm.productIndex === "" || nextForm.paymentTermIndex === "") return nextForm;
    const product = products[Number(nextForm.productIndex)];
    const price = product?.prices[Number(nextForm.paymentTermIndex)];
    if (!product || price === undefined) return nextForm;
    return {
      ...nextForm,
      tableUnitPrice: price.toFixed(2),
      bagWeightKg: String(product.weightKg),
    };
  }

  function changeProduct(productIndex: string) {
    setItemForm((current) => fillProductPrice({ ...current, productIndex }));
  }

  function changePaymentTerm(paymentTermIndex: string) {
    setItemForm((current) => fillProductPrice({ ...current, paymentTermIndex }));
  }

  function changeItemField<Key extends keyof ItemFormState>(key: Key, value: ItemFormState[Key]) {
    setItemForm((current) => ({ ...current, [key]: value }));
  }

  function changeFreightTable(table: FreightFormState["table"]) {
    setFreightForm((current) => ({
      ...current,
      table,
      rangeIndex: table === "" ? "" : "0",
    }));
  }

  function changeFreightField<Key extends keyof FreightFormState>(
    key: Key,
    value: FreightFormState[Key],
  ) {
    setFreightForm((current) => ({ ...current, [key]: value }));
  }

  function resetItemForm() {
    setItemForm(initialItemForm);
  }

  function submitItem() {
    const tableUnitPrice = numberOrZero(itemForm.tableUnitPrice);
    const quantity = Number.parseInt(itemForm.quantity, 10) || 0;

    if (tableUnitPrice <= 0 || quantity < 1) {
      window.alert("Informe um preço de tabela e uma quantidade válida antes de adicionar o produto.");
      return;
    }

    const discountLine = itemForm.discountLineIndex === ""
      ? undefined
      : discountLines[Number(itemForm.discountLineIndex)];
    const customDiscountPercentage = numberOrZero(itemForm.customDiscountPercentage);
    const lineDiscountPercentage = discountLine?.percentage === null
      ? customDiscountPercentage
      : discountLine?.percentage ?? 0;
    const product = itemForm.productIndex === ""
      ? undefined
      : products[Number(itemForm.productIndex)];
    const weightKg = product?.weightKg ?? (numberOrZero(itemForm.bagWeightKg) || 30);

    const orderItem: OrderItem = {
      id: editingIndex === null ? nextId.current++ : items[editingIndex].id,
      name: product?.name ?? "Preço informado manualmente",
      productIndex: itemForm.productIndex,
      paymentTermIndex: itemForm.paymentTermIndex,
      tableUnitPrice,
      quantity,
      weightKg,
      lineDiscountPercentage,
      discountLineIndex: itemForm.discountLineIndex,
      customDiscountPercentage,
      categoryName: product?.group ?? null,
    };

    if (editingIndex === null) {
      setItems((current) => [...current, orderItem]);
    } else {
      setItems((current) => current.map((item, index) => index === editingIndex ? orderItem : item));
      setEditingIndex(null);
    }
    resetItemForm();
  }

  function editItem(index: number) {
    const item = items[index];
    if (!item) return;
    setEditingIndex(index);
    setItemForm({
      productIndex: item.productIndex,
      paymentTermIndex: item.paymentTermIndex,
      tableUnitPrice: String(item.tableUnitPrice),
      discountLineIndex: item.discountLineIndex,
      customDiscountPercentage: item.customDiscountPercentage
        ? String(item.customDiscountPercentage)
        : "",
      quantity: String(item.quantity),
      bagWeightKg: String(item.weightKg),
    });
    document.getElementById("addItemButton")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, currentIndex) => currentIndex !== index));
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex !== null && index < editingIndex) setEditingIndex(editingIndex - 1);
  }

  function cancelEditing() {
    setEditingIndex(null);
    resetItemForm();
  }

  /** Carrega um orçamento salvo, com os preços originais, para edição. */
  function loadQuote({ quote, items: quoteItems }: SavedQuoteDetail) {
    const state = quoteToCalculatorState(quote, quoteItems, data, nextId.current);
    nextId.current += state.items.length;
    setItems(state.items);
    setEditingIndex(null);
    resetItemForm();
    setFreightForm(state.freightForm);
    setAnticipatedPayment(state.anticipatedPayment);
    setHandlingEnabled(state.handlingEnabled);
    setHandlingRatePerTon(state.handlingRatePerTon);
    setEditingQuote({
      id: quote.id,
      number: quote.quote_number,
      status: quote.status,
      customerId: quote.customer_id,
      customerName: quote.customer_name_snapshot,
      customerDocument: quote.customer_document_snapshot,
    });
  }

  /** Volta a calculadora ao estado inicial, para começar um novo pedido. */
  function resetOrder() {
    setEditingQuote(null);
    setItems([]);
    setEditingIndex(null);
    resetItemForm();
    setFreightForm(initialFreightForm);
    setAnticipatedPayment(false);
    setHandlingEnabled(false);
    setHandlingRatePerTon(String(data.handlingRatePerTon));
  }

  const showManualWeight =
    (freightForm.table !== "" || handlingEnabled) && itemForm.productIndex === "";

  return {
    data,
    itemForm,
    freightForm,
    items,
    editingIndex,
    anticipatedPayment,
    handlingEnabled,
    handlingRatePerTon,
    calculation,
    showManualWeight,
    changeProduct,
    changePaymentTerm,
    changeItemField,
    changeFreightTable,
    changeFreightField,
    setAnticipatedPayment,
    setHandlingEnabled,
    setHandlingRatePerTon,
    submitItem,
    editItem,
    removeItem,
    cancelEditing,
    resetOrder,
    editingQuote,
    loadQuote,
  };
}

export type CalculatorController = ReturnType<typeof useCalculator>;
