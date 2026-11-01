import { get, FieldErrors } from 'react-hook-form';
import { isErrorMessage } from './isErrorMessage';

export const isError = (
  field: string,
  errors: FieldErrors,
  touchFields: Partial<Readonly<Record<string, boolean>>>
): boolean => get(touchFields, field) && Boolean(isErrorMessage(field, errors));
