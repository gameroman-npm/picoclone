export interface CloneOpts {
  circular?: boolean;
  depth?: number;
  prototype?: unknown;
  includeNonEnumerable?: boolean;
}

const __str = (v: unknown) => Object.prototype.toString.call(v);

const isRegExp = (v: unknown): v is RegExp => __str(v) === "[object RegExp]";
const isDate = (v: unknown): v is Date => __str(v) === "[object Date]";

export function clone<T>(
  val: T,
  {
    circular = true,
    depth = Infinity,
    prototype,
    includeNonEnumerable = false,
  }: CloneOpts = {},
): T {
  // Use WeakMap for efficient circular reference tracking
  const allParents = new WeakMap();

  const _clone = <T>(value: T, currentDepth: number): T => {
    // 1. Handle Primitives and Null
    if (value === null || typeof value !== "object") {
      return value;
    }

    // 2. Handle Depth Limit
    if (currentDepth <= 0) {
      return value;
    }

    // 3. Circular Reference Check
    if (circular && allParents.has(value)) {
      return allParents.get(value);
    }

    let child;

    // 4. Handle Specific Types
    if (isDate(value)) {
      child = new Date(value.getTime());
    } else if (isRegExp(value)) {
      child = new RegExp(value.source, value.flags);
      child.lastIndex = value.lastIndex;
    } else if (value instanceof Map) {
      child = new Map() as T & Map<unknown, unknown>;
      allParents.set(value, child); // Set early for circularity
      for (const [k, v] of value) {
        child.set(_clone(k, currentDepth - 1), _clone(v, currentDepth - 1));
      }
      return child;
    } else if (value instanceof Set) {
      child = new Set() as T & Set<unknown>;
      allParents.set(value, child);
      for (const v of value) {
        child.add(_clone(v, currentDepth - 1));
      }
      return child;
    } else if (value instanceof Promise) {
      child = value.then(
        (v) => _clone(v, currentDepth - 1),
        (err) => {
          throw _clone(err, currentDepth - 1);
        },
      );
    } else if (Array.isArray(value)) {
      child = [];
    } else if (Error.isError(value)) {
      child = Object.create(Object.getPrototypeOf(value));
    } else {
      // 5. Handle Objects & Prototypes
      const proto = prototype ?? Object.getPrototypeOf(value);
      child = Object.create(proto);
    }

    if (circular) {
      allParents.set(value, child);
    }

    // 6. Property Copying (Enumerable & Symbols)
    const props = includeNonEnumerable
      ? Object.getOwnPropertyNames(value)
      : Object.keys(value);

    const symbols: (symbol | string)[] = Object.getOwnPropertySymbols(value);

    [...props, ...symbols].forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;

      // Skip setters without getters or read-only properties if necessary
      if (descriptor.writable || descriptor.set || descriptor.configurable) {
        // @ts-expect-error
        const clonedValue = _clone(value[key], currentDepth - 1);

        if (includeNonEnumerable || symbols.includes(key)) {
          Object.defineProperty(child, key, {
            ...descriptor,
            value: clonedValue,
          });
        } else {
          child[key] = clonedValue;
        }
      }
    });

    return child;
  };

  return _clone(val, depth);
}

// Flat clone helper
export const clonePrototype = <T extends object | null>(val: T): T =>
  val === null ? val : Object.create(val);
