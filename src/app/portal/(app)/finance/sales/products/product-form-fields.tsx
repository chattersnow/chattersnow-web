"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductRow } from "./products-shared";

export type ProductFormState = {
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

export function emptyProductForm(): ProductFormState {
  return { name: "", description: "", sortOrder: "0", isActive: true };
}

export function productFormStateFor(product: ProductRow): ProductFormState {
  return {
    name: product.name,
    description: product.description ?? "",
    sortOrder: String(product.sort_order),
    isActive: product.is_active,
  };
}

/**
 * Appends the product's fields to a FormData the caller owns, rather than
 * making one. `new-product-dialog` posts a product and its first variant in a
 * single submission, so both packers have to write into the same object.
 */
export function packProductFormData(
  form: ProductFormState,
  formData = new FormData(),
) {
  formData.set("name", form.name);
  formData.set("description", form.description);
  formData.set("sortOrder", form.sortOrder);
  formData.set("isActive", form.isActive ? "on" : "off");
  return formData;
}

export function ProductFormFields({
  form,
  update,
  idPrefix,
}: {
  form: ProductFormState;
  update: <K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Product name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          required
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`}>Description</FieldLabel>
        <Textarea
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
        />
      </Field>

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
    </>
  );
}
