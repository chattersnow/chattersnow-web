"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  groupInventoryCategories,
  OTHER_CATEGORY_KEY,
  type InventoryCategory,
} from "@/lib/inventory";

/**
 * The item category picker (issue #667), shared by the three write paths that
 * used to render a bare free-text <Input>: the item edit sheet, donation
 * intake, and the donation edit sheet.
 *
 * Two levels, rendered as one <SelectGroup> per category group. A combobox
 * would be the reach for a much longer vocabulary; at ~27 options a grouped
 * Select is the right primitive, and it's the one the rest of the portal
 * already uses.
 *
 * Every call site builds its own FormData (the item sheet) or its own draft
 * object (the two donation forms), so this renders no hidden inputs and reports
 * changes through the two callbacks instead.
 *
 * Choosing "Other" reveals a required free-text field. That text is stored in
 * the legacy `inventory_items.type` column — which is why "Other" is a real
 * seeded category rather than a null category: `null` means nobody has
 * classified the item yet, `other` means a human looked and nothing fit.
 */
export function CategorySelect({
  categories,
  categoryId,
  detail,
  onCategoryChange,
  onDetailChange,
  idPrefix,
  required = true,
  disabled = false,
}: {
  categories: InventoryCategory[];
  categoryId: string;
  detail: string;
  onCategoryChange: (categoryId: string) => void;
  onDetailChange: (detail: string) => void;
  /** Distinguishes the rendered ids when several appear on one page. */
  idPrefix: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const groups = groupInventoryCategories(categories);
  const selected = categories.find((category) => category.id === categoryId);
  const isOther = selected?.key === OTHER_CATEGORY_KEY;

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-category`}>Item category</FieldLabel>
        <Select
          value={categoryId || null}
          disabled={disabled}
          onValueChange={(value) => onCategoryChange((value as string) ?? "")}
        >
          <SelectTrigger id={`${idPrefix}-category`} className="w-full">
            <SelectValue placeholder="Select a category">
              {() => selected?.label ?? "Select a category"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.key}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {isOther ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-category-detail`}>
            Describe the item
          </FieldLabel>
          <Input
            id={`${idPrefix}-category-detail`}
            required={required}
            placeholder="e.g. Vintage ski poles"
            value={detail}
            disabled={disabled}
            onChange={(event) => onDetailChange(event.target.value)}
          />
        </Field>
      ) : null}
    </>
  );
}
