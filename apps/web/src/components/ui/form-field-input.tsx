"use client"

import * as React from "react"
import {
  useFormContext,
  type FieldPath,
  type FieldValues,
  type ControllerRenderProps,
} from "react-hook-form"
import { ValidatedInput, type ValidatedInputProps } from "./validated-input"
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "./form"

export interface FormFieldInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> extends Omit<ValidatedInputProps, "name" | "isValid" | "isError"> {
  /** Field name (required) */
  name: TName
  /** Label text */
  label?: string
  /** Description text shown below the input */
  description?: string
  /** Whether to show validation indicators (default: true) */
  showValidation?: boolean
  /** Custom render for additional content inside FormItem */
  children?: React.ReactNode
  /** Label content to render between label and description */
  labelRight?: React.ReactNode
}

/**
 * A convenience component that combines FormField, FormItem, FormLabel,
 * FormControl, FormDescription, FormMessage, and ValidatedInput
 * with automatic validation state handling.
 *
 * Usage:
 * ```tsx
 * <FormFieldInput
 *   name="email"
 *   label="Email Address"
 *   type="email"
 *   placeholder="name@example.com"
 *   description="We'll never share your email"
 * />
 * ```
 */
function FormFieldInput<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  name,
  label,
  description,
  showValidation = true,
  children,
  labelRight,
  ...inputProps
}: FormFieldInputProps<TFieldValues, TName>) {
  const { control, formState } = useFormContext<TFieldValues>()

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        // Determine validation state
        const isTouched = fieldState.isTouched
        const isDirty = fieldState.isDirty
        const hasError = !!fieldState.error
        const isValid = (isTouched || isDirty) && !hasError && field.value !== ""

        return (
          <FormItem>
            {(label || labelRight) && (
              <div className="flex items-center justify-between">
                {label && <FormLabel>{label}</FormLabel>}
                {labelRight}
              </div>
            )}
            <FormControl>
              <ValidatedInput
                {...inputProps}
                {...field}
                isValid={isValid}
                isError={hasError}
                showValidation={showValidation}
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
            {children}
          </FormItem>
        )
      }}
    />
  )
}

export { FormFieldInput }
