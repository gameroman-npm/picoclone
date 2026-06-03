import assert from "node:assert";
import test from "node:test";
import vm from "node:vm";
import type { Context } from "node:vm";

import { clone, isDate, isRegExp, clonePrototype } from "picoclone";

function inspect(obj: unknown): string {
  let seen: unknown[] = [];
  return JSON.stringify(obj, function (_key, val) {
    if (val !== null && typeof val == "object") {
      if (seen.indexOf(val) >= 0) {
        return "[cyclic]";
      }
      seen.push(val);
    }
    return val;
  });
}

function apartContext(
  context: Context,
  script: string,
  callback: (ctx: unknown) => void,
): void {
  const ctx = vm.createContext({ ctx: context });
  callback(vm.runInContext(script, ctx));
}

test("clone string", () => {
  var a = "foo";
  assert.strictEqual(clone(a), a);
  a = "";
  assert.strictEqual(clone(a), a);
});

test("clone number", () => {
  var a = 0;
  assert.strictEqual(clone(a), a);
  a = 1;
  assert.strictEqual(clone(a), a);
  a = -1000;
  assert.strictEqual(clone(a), a);
  a = 3.1415927;
  assert.strictEqual(clone(a), a);
  a = -3.1415927;
  assert.strictEqual(clone(a), a);
});

test("clone date", () => {
  var a = new Date();
  var c = clone(a);
  assert.ok(!!a.getUTCDate && !!a.toUTCString);
  assert.ok(!!c.getUTCDate && !!c.toUTCString);
  assert.strictEqual(a.getTime(), c.getTime());
});

test("clone object", () => {
  var a = { foo: { bar: "baz" } };
  var b = clone(a);
  assert.deepStrictEqual(b, a);
});

test("clone error", () => {
  var a = new Error("Boom!!!");
  var b = clone(a);

  assert.deepStrictEqual(b, a);
  assert.ok(b instanceof Error);
  assert.strictEqual(b.message, a.message);
});

test("clone array", () => {
  var a = [{ foo: "bar" }, "baz"];
  var b = clone(a);

  assert.ok(b instanceof Array);
  assert.deepStrictEqual(b, a);
});

test("clone buffer", () => {
  if (typeof Buffer == "undefined") return;

  var a = Buffer.from("this is a test buffer");
  var b = clone(a);

  assert.deepStrictEqual(b, a);
});

test("clone regexp", () => {
  var a = /abc123/gi;
  var b = clone(a);
  assert.deepStrictEqual(b, a);

  var c = /a/g;
  assert.strictEqual(c.lastIndex, 0);

  c.exec("123a456a");
  assert.strictEqual(c.lastIndex, 4);

  var d = clone(c);
  assert.ok(d.global);
  assert.strictEqual(d.lastIndex, 4);
});

test("clone object containing array", () => {
  var a = {
    arr1: [{ a: "1234", b: "2345" }],
    arr2: [{ c: "345", d: "456" }],
  };

  var b = clone(a);
  assert.deepStrictEqual(b, a);
});

test("clone object with circular reference", () => {
  var c = [1, "foo", { hello: "bar" }, function () {}, false, [2]];
  var b = [c, 2, 3, 4];

  var a = { b: b, c: c };
  a.loop = a;
  a.loop2 = a;
  c.loop = c;
  c.aloop = a;

  var aCopy = clone(a);
  assert.notStrictEqual(a, aCopy);
  assert.notStrictEqual(a.c, aCopy.c);
  assert.strictEqual(aCopy.c, aCopy.b[0]);
  assert.strictEqual(aCopy.c.loop.loop.aloop, aCopy);
  assert.strictEqual(aCopy.c[0], a.c[0]);

  assert.ok(eq(a, aCopy));
  aCopy.c[0] = 2;
  assert.ok(!eq(a, aCopy));
  aCopy.c = "2";
  assert.ok(!eq(a, aCopy));

  function eq(x, y) {
    return inspect(x) === inspect(y);
  }
});

test("clone prototype", () => {
  var a = {
    a: "aaa",
    x: 123,
    y: 45.65,
  };
  var b = clonePrototype(a);

  assert.strictEqual(b.a, a.a);
  assert.strictEqual(b.x, a.x);
  assert.strictEqual(b.y, a.y);
});

test("clone within an apart context", () => {
  return new Promise<void>((resolve) => {
    apartContext(
      { clone },
      "results = ctx.clone({ a: [1, 2, 3], d: new Date(), r: /^foo$/ig })",
      function (results) {
        assert.strictEqual(results.a.constructor.toString(), Array.toString());
        assert.strictEqual(results.d.constructor.toString(), Date.toString());
        assert.strictEqual(results.r.constructor.toString(), RegExp.toString());
        resolve();
      },
    );
  });
});

test("clone object with no constructor", () => {
  var n = null;

  var a = { foo: "bar" };
  a.__proto__ = n;
  assert.strictEqual(typeof a, "object");
  assert.notStrictEqual(a, null);

  var b = clone(a);
  assert.strictEqual(b.foo, a.foo);
});

test("clone object with depth argument", () => {
  var a = {
    foo: {
      bar: {
        baz: "qux",
      },
    },
  };

  var b = clone(a, { circular: false, depth: 1 });
  assert.deepStrictEqual(b, a);
  assert.notStrictEqual(b, a);
  assert.strictEqual(b.foo, a.foo);

  b = clone(a, { depth: 2 });
  assert.deepStrictEqual(b, a);
  assert.notStrictEqual(b.foo, a.foo);
  assert.strictEqual(b.foo.bar, a.foo.bar);
});

test("maintain prototype chain in clones", () => {
  function T() {}

  var a = new T();
  var b = clone(a);
  assert.strictEqual(Object.getPrototypeOf(a), Object.getPrototypeOf(b));
});

test("parent prototype is overriden with prototype provided", () => {
  function T() {}

  var a = new T();
  var b = clone(a, { prototype: null });
  assert.strictEqual(b.__defineSetter__, undefined);
});

test("clone object with null children", () => {
  var a = {
    foo: {
      bar: null,
      baz: {
        qux: false,
      },
    },
  };

  var b = clone(a);
  assert.deepStrictEqual(b, a);
});

test("clone instance with getter", () => {
  function Ctor() {}
  Object.defineProperty(Ctor.prototype, "prop", {
    configurable: true,
    enumerable: true,
    get: function () {
      return "value";
    },
  });

  var a = new Ctor();
  var b = clone(a);

  assert.strictEqual(b.prop, "value");
});

if (typeof Symbol !== "undefined") {
  test("clone object with symbol properties", () => {
    var symbol = Symbol();
    var obj = {};
    obj[symbol] = "foo";

    var child = clone(obj);

    assert.notStrictEqual(child, obj);
    assert.strictEqual(child[symbol], "foo");
  });

  test("symbols are treated as primitives", () => {
    var symbol = Symbol();
    var obj = { foo: symbol };

    var child = clone(obj);

    assert.notStrictEqual(child, obj);
    assert.strictEqual(child.foo, obj.foo);
  });
}

test("get RegExp flags", () => {
  assert.strictEqual(/a/.flags, "");
  assert.strictEqual(/a/i.flags, "i");
  assert.strictEqual(/a/g.flags, "g");
  assert.strictEqual(/a/gi.flags, "gi");
  assert.strictEqual(/a/m.flags, "m");
});

test("recognize Array object", () => {
  return new Promise<void>((resolve) => {
    apartContext(null, "results = [1, 2, 3]", function (alien) {
      const local = [4, 5, 6];
      assert.ok(Array.isArray(alien));
      assert.ok(Array.isArray(local));
      assert.ok(!isDate(alien));
      assert.ok(!isDate(local));
      assert.ok(!isRegExp(alien));
      assert.ok(!isRegExp(local));
      resolve();
    });
  });
});

test("recognize Date object", () => {
  return new Promise<void>((resolve) => {
    apartContext(null, "results = new Date()", function (alien) {
      const local = new Date();

      assert.ok(isDate(alien));
      assert.ok(isDate(local));
      assert.ok(!Array.isArray(alien));
      assert.ok(!Array.isArray(local));
      assert.ok(!isRegExp(alien));
      assert.ok(!isRegExp(local));
      resolve();
    });
  });
});

test("recognize RegExp object", () => {
  return new Promise<void>((resolve) => {
    apartContext(null, "results = /foo/", function (alien) {
      const local = /bar/;

      assert.ok(isRegExp(alien));
      assert.ok(isRegExp(local));
      assert.ok(!Array.isArray(alien));
      assert.ok(!Array.isArray(local));
      assert.ok(!isDate(alien));
      assert.ok(!isDate(local));
      resolve();
    });
  });
});

test("clone a native Map", () => {
  var map = new Map();
  map.set("foo", "bar");
  map.set(map, map);
  map.bar = "baz";
  map.circle = map;

  var clonedMap = clone(map);
  assert.notStrictEqual(map, clonedMap);
  assert.strictEqual(clonedMap.get("foo"), "bar");
  assert.strictEqual(clonedMap.get(clonedMap), clonedMap);
  assert.strictEqual(clonedMap.bar, "baz");
  assert.strictEqual(clonedMap.circle, clonedMap);
});

test("clone a native Set", () => {
  var set = new Set();
  set.add("foo");
  set.add(set);
  set.bar = "baz";
  set.circle = set;

  var clonedSet = clone(set);
  assert.notStrictEqual(set, clonedSet);
  assert.ok(clonedSet.has("foo"));
  assert.ok(clonedSet.has(clonedSet));
  assert.ok(!clonedSet.has(set));
  assert.strictEqual(clonedSet.bar, "baz");
  assert.strictEqual(clonedSet.circle, clonedSet);
});

test("clone a native Promise", async () => {
  // Resolving to a value
  const p1 = await clone(Promise.resolve("foo"));
  assert.strictEqual(p1, "foo");

  // Rejecting to a value
  try {
    await clone(Promise.reject("bar"));
  } catch (value) {
    assert.strictEqual(value, "bar");
  }

  // Resolving to a promise
  const p2 = await clone(Promise.resolve(Promise.resolve("baz")));
  assert.strictEqual(p2, "baz");

  // Resolving to a circular value
  var circle = {};
  circle.circle = circle;
  const p3 = await clone(Promise.resolve(circle));
  assert.notStrictEqual(circle, p3);
  assert.strictEqual(p3.circle, p3);

  var expandoPromise = Promise.resolve("ok");
  expandoPromise.circle = expandoPromise;
  expandoPromise.prop = "val";
  var clonedPromise = clone(expandoPromise);
  assert.notStrictEqual(expandoPromise, clonedPromise);
  assert.strictEqual(clonedPromise.prop, "val");
  assert.strictEqual(clonedPromise.circle, clonedPromise);

  const p4 = await clonedPromise;
  assert.strictEqual(p4, "ok");
});

test("clone only enumerable symbol properties", () => {
  var source = {};
  var symbol1 = Symbol("the first symbol");
  var symbol2 = Symbol("the second symbol");
  var symbol3 = Symbol("the third symbol");
  source[symbol1] = 1;
  source[symbol2] = 2;
  source[symbol3] = 3;
  Object.defineProperty(source, symbol2, {
    enumerable: false,
  });

  var cloned = clone(source);
  assert.strictEqual(cloned[symbol1], 1);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(cloned, symbol2),
    false,
  );
  assert.strictEqual(cloned[symbol3], 3);
});

test("clone should ignore non-enumerable properties by default", () => {
  var source = {
    x: 1,
    y: 2,
  };
  Object.defineProperty(source, "y", {
    enumerable: false,
  });
  Object.defineProperty(source, "z", {
    value: 3,
  });
  var symbol1 = Symbol("a");
  var symbol2 = Symbol("b");
  source[symbol1] = 4;
  source[symbol2] = 5;
  Object.defineProperty(source, symbol2, {
    enumerable: false,
  });

  var cloned = clone(source);
  assert.strictEqual(cloned.x, 1);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cloned, "y"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cloned, "z"), false);
  assert.strictEqual(cloned[symbol1], 4);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(cloned, symbol2),
    false,
  );
});

test("clone should support cloning non-enumerable properties", () => {
  var source = { x: 1, b: [2] };
  Object.defineProperty(source, "b", {
    enumerable: false,
  });
  var symbol = Symbol("a");
  source[symbol] = { x: 3 };
  Object.defineProperty(source, symbol, {
    enumerable: false,
  });

  const cloned = clone(source, {
    circular: false,
    depth: Infinity,
    prototype: undefined,
    includeNonEnumerable: true,
  });
  assert.strictEqual(cloned.x, 1);
  assert.strictEqual(cloned.b instanceof Array, true);
  assert.strictEqual(cloned.b.length, 1);
  assert.strictEqual(cloned.b[0], 2);
  assert.strictEqual(cloned[symbol] instanceof Object, true);
  assert.strictEqual(cloned[symbol].x, 3);
});

test("clone should allow enabling the cloning of non-enumerable properties via an options object", () => {
  var source = { x: 1 };
  Object.defineProperty(source, "x", {
    enumerable: false,
  });

  var cloned = clone(source, {
    includeNonEnumerable: true,
  });
  assert.strictEqual(cloned.x, 1);
});

test("clone should mark the cloned non-enumerable properties as non-enumerable", () => {
  var source = { x: 1, y: 2 };
  Object.defineProperty(source, "y", {
    enumerable: false,
  });
  var symbol1 = Symbol("a");
  var symbol2 = Symbol("b");
  source[symbol1] = 3;
  source[symbol2] = 4;
  Object.defineProperty(source, symbol2, {
    enumerable: false,
  });

  var cloned = clone(source, {
    includeNonEnumerable: true,
  });
  assert.strictEqual(
    Object.getOwnPropertyDescriptor(cloned, "x").enumerable,
    true,
  );
  assert.strictEqual(
    Object.getOwnPropertyDescriptor(cloned, "y").enumerable,
    false,
  );
  assert.strictEqual(
    Object.getOwnPropertyDescriptor(cloned, symbol1).enumerable,
    true,
  );
  assert.strictEqual(
    Object.getOwnPropertyDescriptor(cloned, symbol2).enumerable,
    false,
  );
});

test("clone should not fail when cloning an object that does not have setters defined on some of its properties", () => {
  var source = { x: null };
  Object.defineProperty(source, "x", {
    get: function () {
      return null;
    },
  });

  assert.doesNotThrow(function () {
    clone(source);
  });
});
