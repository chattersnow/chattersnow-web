"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil, Plus } from "lucide-react";
import {
  createVariantAction,
  deleteProductAction,
  deleteVariantAction,
  setVariantStockAction,
  updateProductAction,
  updateVariantAction,
} from "./actions";
import {
  ProductFormFields,
  packProductFormData,
  productFormStateFor,
  type ProductFormState,
} from "./product-form-fields";
import {
  VariantFormFields,
  emptyVariantForm,
  packVariantFormData,
  variantFormStateFor,
  type VariantFormState,
} from "./variant-form-fields";
import {
  sortedVariants,
  type ProductRow,
  type VariantRow,
} from "./products-shared";
import { StatusBadge } from "@/components/portal/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";

function isProductDirty(form: ProductFormState, product: ProductRow) {
  const baseline = productFormStateFor(product);
  return (Object.keys(baseline) as (keyof ProductFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

export function ProductDetailsSheet({
  product,
  canManage,
}: {
  product: ProductRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<ProductFormState>(() =>
    productFormStateFor(product),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Variant editing lives beside the product form rather than in a dialog of
  // its own: a variant is only ever reached through its product, and stacking
  // a modal on a sheet hides the list the person is working against.
  const [variantForm, setVariantForm] = useState<VariantFormState | null>(null);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [deletingVariant, setDeletingVariant] = useState<VariantRow | null>(
    null,
  );
  // Per-variant stock drafts, keyed by id. A stock take is one number typed
  // against one variant, so nothing here is shared between rows.
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const formId = `edit-product-form-${product.id}`;
  const dirty = isProductDirty(form, product);
  const variants = sortedVariants(product);

  function update<K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateVariant<K extends keyof VariantFormState>(
    key: K,
    value: VariantFormState[K],
  ) {
    setVariantForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function closeVariantForm() {
    setVariantForm(null);
    setEditingVariantId(null);
    setVariantError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(productFormStateFor(product));
      setError(null);
      setMode("view");
      closeVariantForm();
      setStockDrafts({});
    }
  }

  function requestExitEditMode() {
    if (dirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    setForm(productFormStateFor(product));
    setError(null);
    setMode("view");
    if (discardTarget === "close") setOpen(false);
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateProductAction(
        product.id,
        packProductFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Product saved.");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProductAction(product.id);
      setConfirmingDelete(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Product deleted.");
      router.refresh();
    });
  }

  function handleVariantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variantForm) return;
    setVariantError(null);

    startTransition(async () => {
      const formData = packVariantFormData(variantForm);
      const result = editingVariantId
        ? await updateVariantAction(editingVariantId, formData)
        : await createVariantAction(product.id, formData);
      if ("error" in result) {
        setVariantError(result.error);
        return;
      }
      closeVariantForm();
      toast.success(editingVariantId ? "Variant saved." : "Variant added.");
      router.refresh();
    });
  }

  function handleSetStock(variant: VariantRow) {
    setVariantError(null);
    const draft = stockDrafts[variant.id] ?? String(variant.stock_on_hand);

    startTransition(async () => {
      const result = await setVariantStockAction(variant.id, Number(draft));
      if ("error" in result) {
        setVariantError(result.error);
        return;
      }
      setStockDrafts((prev) => {
        const next = { ...prev };
        delete next[variant.id];
        return next;
      });
      toast.success("Stock updated.");
      router.refresh();
    });
  }

  function handleDeleteVariant() {
    if (!deletingVariant) return;
    const target = deletingVariant;
    setVariantError(null);

    startTransition(async () => {
      const result = await deleteVariantAction(target.id);
      setDeletingVariant(null);
      if ("error" in result) {
        setVariantError(result.error);
        return;
      }
      toast.success("Variant deleted.");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`View ${product.name}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>{`View ${product.name}`}</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false}>
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {mode === "edit" ? "Edit product" : product.name}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Rename it, reorder it, or retire it from the register."
                  : "Variants, prices and stock for this product."}
              </SheetDescription>
            </div>
            {canManage &&
              (mode === "view" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit product"
                        onClick={() => setMode("edit")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit product</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={requestExitEditMode}
                >
                  View
                </Button>
              ))}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Product" htmlFor="product-name-view">
                  {product.name}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Description"
                  htmlFor="product-description-view"
                >
                  {product.description ?? "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Sort order" htmlFor="product-sort-view">
                  {product.sort_order}
                </ReadOnlyField>
                <ReadOnlyField label="Active" htmlFor="product-active-view">
                  {product.is_active ? "Yes" : "No"}
                </ReadOnlyField>
              </FieldGroup>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Variants</h3>
                  {canManage && !variantForm && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingVariantId(null);
                        setVariantForm(emptyVariantForm());
                        setVariantError(null);
                      }}
                    >
                      <Plus /> Add variant
                    </Button>
                  )}
                </div>

                {variantError && (
                  <Alert variant="destructive">
                    <AlertDescription>{variantError}</AlertDescription>
                  </Alert>
                )}

                {variants.length === 0 && !variantForm && (
                  <p className="app-muted text-sm">
                    This product has no variants, so the register cannot sell
                    it. Add one to give it a price.
                  </p>
                )}

                <ul className="space-y-3">
                  {variants.map((variant) => (
                    <li
                      key={variant.id}
                      className="rounded-lg border border-[var(--line)] p-3"
                    >
                      {editingVariantId === variant.id && variantForm ? (
                        <form onSubmit={handleVariantSubmit}>
                          <FieldGroup>
                            <VariantFormFields
                              form={variantForm}
                              update={updateVariant}
                              idPrefix={`variant-${variant.id}`}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={closeVariantForm}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={isPending}
                              >
                                {isPending ? <Spinner /> : "Save variant"}
                              </Button>
                            </div>
                          </FieldGroup>
                        </form>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">
                                {variant.label}
                              </span>
                              <StatusBadge
                                tone={variant.is_active ? "info" : "neutral"}
                              >
                                {variant.is_active ? "Active" : "Inactive"}
                              </StatusBadge>
                            </div>
                            <span className="font-medium">
                              {formatCurrency(variant.price)}
                            </span>
                          </div>

                          {variant.sku && (
                            <p className="app-muted text-xs">
                              SKU {variant.sku}
                            </p>
                          )}

                          {canManage ? (
                            <div className="flex flex-wrap items-end gap-2">
                              <Field className="w-28">
                                <FieldLabel
                                  htmlFor={`variant-stock-${variant.id}`}
                                >
                                  Stock
                                </FieldLabel>
                                <Input
                                  id={`variant-stock-${variant.id}`}
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={
                                    stockDrafts[variant.id] ??
                                    String(variant.stock_on_hand)
                                  }
                                  onChange={(event) =>
                                    setStockDrafts((prev) => ({
                                      ...prev,
                                      [variant.id]: event.target.value,
                                    }))
                                  }
                                />
                              </Field>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                  isPending ||
                                  (stockDrafts[variant.id] ??
                                    String(variant.stock_on_hand)) ===
                                    String(variant.stock_on_hand)
                                }
                                onClick={() => handleSetStock(variant)}
                              >
                                Set stock
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingVariantId(variant.id);
                                  setVariantForm(variantFormStateFor(variant));
                                  setVariantError(null);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingVariant(variant)}
                              >
                                Delete
                              </Button>
                            </div>
                          ) : (
                            <p className="app-muted text-sm">
                              {variant.stock_on_hand} in stock
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {variantForm && editingVariantId === null && (
                  <form
                    onSubmit={handleVariantSubmit}
                    className="rounded-lg border border-[var(--line)] p-3"
                  >
                    <FieldGroup>
                      <VariantFormFields
                        form={variantForm}
                        update={updateVariant}
                        idPrefix="new-variant"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={closeVariantForm}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={isPending}>
                          {isPending ? <Spinner /> : "Add variant"}
                        </Button>
                      </div>
                    </FieldGroup>
                  </form>
                )}
              </section>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <ProductFormFields
                    form={form}
                    update={update}
                    idPrefix={`product-edit-${product.id}`}
                  />

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter className="flex-row justify-between border-t bg-muted/50">
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this product. Leaving now will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              Its variants go with it. Deleting only works while none of them
              has ever been sold — if one has, deactivate the product instead so
              its sales history stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingDelete(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingVariant !== null}
        onOpenChange={(next) => !next && setDeletingVariant(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deletingVariant?.label ?? "this variant"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deleting only works while this variant has never been sold. If it
              has, deactivate it instead — it keeps its sales history and
              disappears from the register.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingVariant(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVariant}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
