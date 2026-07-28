import { MoveType, Region } from '@prisma/client';
import { z } from 'zod';

export const normalizeToArray = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.includes(',')) {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [value];
  }

  return value;
};

export const hasUniqueValues = <T>(values: T[]) => {
  return new Set(values).size === values.length;
};

export const moveTypeArraySchema = z.preprocess(
  normalizeToArray,
  z.array(z.enum(MoveType)).min(1).refine(hasUniqueValues)
);

export const regionArraySchema = z.preprocess(
  normalizeToArray,
  z.array(z.enum(Region)).min(1).refine(hasUniqueValues)
);
