export interface CloneOpts {
  /** @default true */
  circular?: boolean;
  /** @default Infinity */
  depth?: number;
  prototype?: unknown;
  /** @default false */
  includeNonEnumerable?: boolean;
}

const __str = (v: unknown) => Object.prototype.toString.call(v);

export const isRegExp = (v: unknown): v is RegExp =>
  __str(v) === "[object RegExp]";
export const isDate = (v: unknown): v is Date => __str(v) === "[object Date]";

const hasBuffer = typeof Buffer !== "undefined";

export function clone<T>(val: T, opts: CloneOpts = {}): T {
  const {
    circular = true,
    depth = Infinity,
    prototype,
    includeNonEnumerable = false,
  } = opts;

  // Use WeakMap for efficient circular reference tracking
  const allParents = new WeakMap();

  const _clone = <T>(value: T, currentDepth: number): T => {
    if (value === null || typeof value !== "object") {
      return value;
    }

    if (currentDepth <= 0) {
      return value;
    }

    if (circular && allParents.has(value)) {
      return allParents.get(value);
    }

    let child;

    if (isDate(value)) {
      child = new Date(value.getTime());
    } else if (isRegExp(value)) {
      child = new RegExp(value.source, value.flags);
      child.lastIndex = value.lastIndex;
    } else if (value instanceof Map) {
      child = new Map() as T & Map<unknown, unknown>;
      allParents.set(value, child);
      for (const [k, v] of value) {
        child.set(_clone(k, currentDepth - 1), _clone(v, currentDepth - 1));
      }
    } else if (value instanceof Set) {
      child = new Set() as T & Set<unknown>;
      allParents.set(value, child);
      for (const v of value) {
        child.add(_clone(v, currentDepth - 1));
      }
    } else if (value instanceof Promise) {
      child = value.then(
        (v) => _clone(v, currentDepth - 1),
        (err) => {
          throw _clone(err, currentDepth - 1);
        },
      );
    } else if (hasBuffer && Buffer.isBuffer(value)) {
      return Buffer.from(value) as T;
    } else if (Array.isArray(value)) {
      child = [];
    } else if (Error.isError(value)) {
      child = value;
    } else {
      const proto =
        typeof prototype === "undefined"
          ? Object.getPrototypeOf(value)
          : prototype;
      child = Object.create(proto);
    }

    if (circular) {
      allParents.set(value, child);
    }

    const props = includeNonEnumerable
      ? Object.getOwnPropertyNames(value)
      : Object.keys(value);

    const symbols: (symbol | string)[] = Object.getOwnPropertySymbols(value);

    [...props, ...symbols].forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;

      if (!descriptor.enumerable && !includeNonEnumerable) {
        return;
      }

      if (descriptor.writable || descriptor.set || descriptor.configurable) {
        // @ts-expect-error
        const clonedValue = _clone(value[key], currentDepth - 1);

        if (includeNonEnumerable || typeof key === "symbol") {
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
