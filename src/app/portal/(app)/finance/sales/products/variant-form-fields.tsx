"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { VariantRow } from "./products-shared";

export type VariantFormState = {
  label: string;
  sku: string;
  price: string;
  stockOnHand: string;
  sortOrder: string;
  isActive: boolean;
};

export function emptyVariantForm(): VariantFormState {
  return {
    // The default for a product that comes in one size, which is most of the
    // merchandise a small nonprofit sells. Typed over when it isn't.
    label: "One size",
    sku: "",
    price: "",
    stockOnHand: "0",
    sortOrder: "0",
    isActive: true,
  };
}

export function variantFormStateFor(variant: VariantRow): VariantFormState {
  return {
    label: variant.label,
    sku: variant.sku ?? "",
    price: String(variant.price),
    stockOnHand: String(variant.stock_on_hand),
    sortOrder: String(variant.sort_order),
    isActive: variant.is_active,
  };
}

export function packVariantFormData(
  form: VariantFormState,
  formData = new FormData(),
) {
  formData.set("label", form.label);
  formData.set("sku", form.sku);
  formData.set("price", form.price);
  formData.set("stockOnHand", form.stockOnHand);
  formData.set("sortOrder", form.sortOrder);
  formData.set("isActive", form.isActive ? "on" : "off");
  return formData;
}

export function VariantFormFields({
  form,
  update,
  idPrefix,
  showSortOrder = true,
  showActive = true,
}: {
  form: VariantFormState;
  update: <K extends keyof VariantFormState>(
    key: K,
    value: VariantFormState[K],
  ) => void;
  idPrefix: string;
  /** Hidden in the create dialog, where the first variant's order is moot. */
  showSortOrder?: boolean;
  /** Likewise: a variant created alongside its product is always active. */
  showActive?: boolean;
}) {
  return (
    <>
      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-label`}>Variant</FieldLabel>
          <Input
            id={`${idPrefix}-label`}
            required
            value={form.label}
            onChange={(event) => update("label", event.target.value)}
          />
          <FieldDescription>A size, a colour, or “One size”.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-sku`}>SKU</FieldLabel>
          <Input
            id={`${idPrefix}-sku`}
            value={form.sku}
            onChange={(event) => update("sku", event.target.value)}
          />
          <FieldDescription>Optional.</FieldDescription>
        </Field>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-price`}>Price</FieldLabel>
          <Input
            id={`${idPrefix}-price`}
            type="number"
            min="0"
            step="0.01"
            required
            value={form.price}
            onChange={(event) => update("price", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-stock`}>Stock on hand</FieldLabel>
          <Input
            id={`${idPrefix}-stock`}
            type="number"
            min="0"
            step="1"
            required
            value={form.stockOnHand}
            onChange={(event) => update("stockOnHand", event.target.value)}
          />
        </Field>
      </Field>

      {showSortOrder && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-sortOrder`}>Sort order</FieldLabel>
          <Input
            id={`${idPrefix}-sortOrder`}
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => update("sortOrder", event.target.value)}
          />
        </Field>
      )}

      {showActive && (
        <Field orientation="horizontal">
          <Checkbox
            id={`${idPrefix}-isActive`}
            checked={form.isActive}
            onCheckedChange={(checked) => update("isActive", Boolean(checked))}
          />
          <FieldLabel htmlFor={`${idPrefix}-isActive`}>
            Active — offered at the register
          </FieldLabel>
        </Field>
      )}
    </>
  );
}
