"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProductAction } from "./actions";
import {
  ProductFormFields,
  emptyProductForm,
  packProductFormData,
  type ProductFormState,
} from "./product-form-fields";
import {
  VariantFormFields,
  emptyVariantForm,
  packVariantFormData,
  type VariantFormState,
} from "./variant-form-fields";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

/**
 * Creates a product and its first variant in one submission.
 *
 * A product on its own has no price and no stock — it is not sellable and the
 * register has nothing to show — so asking for a variant here rather than
 * afterwards is what stops the catalog filling with half-made rows.
 */
export function NewProductDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<ProductFormState>(emptyProductForm);
  const [variant, setVariant] = useState<VariantFormState>(emptyVariantForm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateProduct<K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) {
    setProduct((prev) => ({ ...prev, [key]: value }));
  }

  function updateVariant<K extends keyof VariantFormState>(
    key: K,
    value: VariantFormState[K],
  ) {
    setVariant((prev) => ({ ...prev, [key]: value }));
  }

  // Compared against fresh empty forms rather than tracked with a flag, so
  // typing and then clearing a field doesn't count as unsaved work.
  const productBaseline = emptyProductForm();
  const variantBaseline = emptyVariantForm();
  const dirty =
    (Object.keys(productBaseline) as (keyof ProductFormState)[]).some(
      (key) => product[key] !== productBaseline[key],
    ) ||
    (Object.keys(variantBaseline) as (keyof VariantFormState)[]).some(
      (key) => variant[key] !== variantBaseline[key],
    );
  const guard = useUnsavedChangesGuard(dirty);

  function resetForm() {
    setProduct(emptyProductForm());
    setVariant(emptyVariantForm());
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!guard.allowOpenChange(nextOpen)) return;
    setOpen(nextOpen);
    if (nextOpen) resetForm();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const formData = packProductFormData(product);
      packVariantFormData(variant, formData);
      const result = await createProductAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("Product created.");
      router.refresh();
    });
  }

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this product"
        onDiscard={() => {
          resetForm();
          setOpen(false);
        }}
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button type="button" className="shrink-0 whitespace-nowrap" />
          }
        >
          New Product
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Merchandise sold at the register. Add its first variant here — you
              can add more sizes afterwards.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <ProductFormFields
                form={product}
                update={updateProduct}
                idPrefix="new-product"
              />

              <FieldSeparator>First variant</FieldSeparator>

              <VariantFormFields
                form={variant}
                update={updateVariant}
                idPrefix="new-product-variant"
                showSortOrder={false}
                showActive={false}
              />

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Add product"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
