import { get, FieldErrors } from 'react-hook-form';

export const isErrorMessage = (field: string, errors: FieldErrors): string =>
  get(errors, `${field}.message`);
