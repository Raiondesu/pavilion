const templatePattern = /\{\{\s*(.*?)\s*\}\}/gm;

/*----------------- COMPONENT -----------------*/

let current: State | null = null;

const nodeDependencyMap = new Map<Function, Set<NodeDependency>>();
const dependencyNodeMap = new Map<ChildNode, NodeDependency[]>();
const dependencyMap = new Map<Function, Set<Function>>();
const watchMap = new Map<Function, Set<Function>>();

interface NodeDependency {
  node: ChildNode;
  name: string;
  state: Function;
  template?: string;
  path?: string;
};
type RenderTarget = string | Element;
type StateMap = Record<string, Function>;
type RenderFunction = (template: RenderTarget) => Promise<Element> | Element;

export type RenderState = Record<string, unknown>;
type Setup = (render: (state?: RenderState) => RenderFunction) => Promise<RenderFunction> | RenderFunction;

export async function createComponent(setup: Setup) {
  let stateMap: StateMap = {};

  const render = await setup(defaultRender);

  return {
    mount(target: RenderTarget) {
      return render(target);
    }
  };

  function defaultRender(state?: RenderState) {
    stateMap = Object.fromEntries(
      Object.entries(state ?? {})
        .map(([key, value]) => isReactive(value) || typeof value === 'function'
          ? [key, value]
          : [key, reactive(value)]
        )
    );

    return (target: RenderTarget) => renderTemplate(markComponent(target), stateMap);
  }

  function markComponent(target: RenderTarget): Element {
    return typeof target === 'string'
      ? document.querySelector(target) ?? (() => {
        throw new Error('No mounting point was provided in component function');
      })()
      : target;
  }
}

/*------------------- HOOKS -------------------*/

export interface State<T = unknown, A extends any[] = []> {
  (...args: A): T;
  reset(): T;
  original: T | undefined;
  value: T;
}

export function isReactive<T>(v: unknown | State<T>): v is State<T> {
  return typeof v === 'function' && 'value' in v;
}

type Equals<T> = (a: T, b: T) => undefined | boolean;

export function reactive<T>(): State<T | undefined>;
export function reactive<T, A extends any[]>(state: (...args: A) => T, equals?: Equals<T>): State<T, A>;
export function reactive<T>(state: T, equals?: Equals<T>): State<T>;
export function reactive<T, A extends any[]>(state?: T | ((...args: A) => T), equals: Equals<T | undefined> = (a, b) => a === b): State<T | undefined, A> {
  let original: T | undefined;
  let dirty = true;
  let raw: T | undefined = undefined;

  const State = new Proxy(
    function (...args: A) {
      if (current) dependencyMap.get(State)?.add(current);
      if (watching) watchers.add(State);
      if (!dirty) return raw;

      let last: State | null;
      [last, current] = [current, State];

      const value = typeof state === 'function'
        ? (state as (...args: A) => T)(...args)
        : state;

      original ??= value;

      current = last;

      dirty = !(equals(raw, value) ?? false);

      raw = value;

      return value;
    } as State<T | undefined>,
    {
      get(target, key: keyof State<T>) {
        switch (key) {
          case 'value': return target();
          case 'reset': return () => State.value = original;
          case 'original': return original;
          default: return target[key];
        }
      },
      set(_, key: keyof State<T>, newValue) {
        if (key === 'value') {
          if (equals?.(raw, newValue))
            return true;

          raw = newValue;
          dirty = false;
          invalidate(State);
        }

        return true;
      },
    },
  );

  dependencyMap.set(State, new Set);

  return State;
}

function invalidate(state: Function, parents: Set<Function> = new Set) {
  patchNodes(state);

  watchMap.get(state)?.forEach(watcher => {
    watcher()
  });

  dependencyMap.get(state)?.forEach(dep => {
    // eliminate circular dependencies
    if (!parents.has(dep)) {
      invalidate(dep, parents.add(state));
    }
  });
}

function patchNodes(state: Function) {
  nodeDependencyMap.get(state)?.forEach(node => {
    patchNode(state, node);
  });
}

let watching = false;
const watchers = new Set<Function>;

export function watch(cb: () => VoidFunction | void) {
  watching = true;

  const unwatch = cb();

  watching = false;
  const watchmaps: Array<Set<Function> | undefined> = [];
  watchers.forEach(state => {
    if (!watchMap.has(state)) {
      watchMap.set(state, new Set);
    }

    watchmaps.push(watchMap.get(state)?.add(() => {
      unwatch?.();
      cb();
    }));
  });

  watchers.clear();

  return () => {
    unwatch?.();
    watchmaps.forEach(w => w?.clear());
  };
}

type Setter<T> = ((prev: T, original: T | undefined) => T);

export function isSetter<T>(v: T | Setter<T>): v is Setter<T> {
  return typeof v === 'function';
}

export function set<T>(state: State<T>, newValue: T | Setter<T>) {
  return state.value = isSetter(newValue)
    ? newValue(state(), state.original)
    : newValue;
}


/*----------------- UTILS -----------------*/

async function renderTemplate(element: Element, component: StateMap) {
  element.childNodes.forEach(el => collectDependencies(el, component));

  if (element instanceof HTMLElement) {
    const elementDisplayStyle = element.style.display;
    element.style.display = 'none';
    element.style.display = elementDisplayStyle;
  }

  return element;
}

function collectDependencies(node: ChildNode, stateMap: StateMap) {
  if (isText(node)) {
    if (!node.nodeValue) return;

    const deps = getDepenencies(node, stateMap);

    dependencyNodeMap.set(node, deps);

    for (const dep of deps) {
      const state = dep.state;

      if (!state) return;

      if (!nodeDependencyMap.has(state)) {
        nodeDependencyMap.set(state, new Set([dep]));
      } else {
        nodeDependencyMap.get(state)?.add(dep);
      }

      patchNode(state, dep);
    }
  }

  else if (isElement(node)) {
    const varKey = node.dataset.bind;
    const state = stateMap[varKey ?? '__404'];

    if (state && varKey) {
      const dep = { node, name: varKey, state };

      if (!nodeDependencyMap.has(state)) {
        nodeDependencyMap.set(state, new Set([dep]));
      } else {
        nodeDependencyMap.get(state)?.add(dep);
      }

      patchNode(state, dep);
    }

    attachEventListeners(node, stateMap);
  }

  node.childNodes.forEach(el => collectDependencies(el, stateMap));
}

function getDepenencies(node: Text, stateMap: StateMap) {
  const found = Array.from(node.nodeValue?.matchAll(templatePattern) ?? []);

  const deps = found.map(match => {
    const varName = match[1];
    const varKey = match[2]?.trim();

    return {
      node,
      state: stateMap[varName],
      template: node.nodeValue ?? undefined,
      name: varName,
      path: varKey
    };
  });

  return deps;
}

function patchNode(state: Function, { node, template, path }: NodeDependency) {
  if (isText(node)) {
    const deps = dependencyNodeMap.get(node);

    node.nodeValue = deps?.reduce(
      (t, d) => t.replaceAll(new RegExp(`{{\\s*${d.name}\\s*}}`, 'gm'), getFromPath(path, d.state())),
      template ?? ''
    ) ?? JSON.stringify(state());

    return;
  }

  else if (isElement(node)) {
    if ('value' in node) {
      node.value = String(getFromPath(path, state()));
    }

    if ('checked' in node && node.getAttribute('type') === 'checkbox') {
      node.checked = getFromPath(path, state());
    }

    return;
  }

  throw new Error(`Unsupported node type: ${node}`);
}

function attachEventListeners(node: HTMLElement, stateMap: StateMap) {
  const eventAttributes = node
    .getAttributeNames()
    .filter(el => el.startsWith('@'));

  eventAttributes.forEach(eventName => {
    const name = node.getAttribute(eventName);

    if (!name) return;

    const handler = stateMap[name];

    if (typeof handler === 'function') {
      node.addEventListener(eventName.replace('@', ''), handler.bind(stateMap));
    }
  });

  const binding = node.dataset.bind;

  if (binding) {
    if (node.tagName.toLowerCase() === 'input') {
      node.addEventListener('input', (event) => {
        if (!event.currentTarget) {
          throw new Error('Event fired without an owner!');
        }

        const type = node.getAttribute('type');
        const isCheckbox = ['checkbox', 'radio'].includes(type ?? 'text');

        if ('value' in event.currentTarget && !isCheckbox) {
          set(stateMap[binding] as State, event.currentTarget.value);
        }

        if ('checked' in event.currentTarget && isCheckbox) {
          set(stateMap[binding] as State, event.currentTarget.checked);
        }
      });
    }

    if (node.tagName.toLowerCase() === 'select') {
      node.addEventListener('change', (event) => {
        if (!event.currentTarget) {
          throw new Error('Event fired without an owner!');
        }

        if ('value' in event.currentTarget) {
          set(stateMap[binding] as State, event.currentTarget.value);
        }
      });
    }
  }

}

function isText(node: ChildNode): node is Text {
  return node.nodeType === node.TEXT_NODE;
}

function isElement(node: ChildNode): node is HTMLElement {
  return node.nodeType === node.ELEMENT_NODE;
}

function getFromPath(path: string | undefined, target: any) {
  return path?.split('.').reduce((o, i) => o[i], target) ?? target;
}

function setOnPath(target: any, value: unknown, path: string) {
  let i;
  const segments = path.split('.');

  for (i = 0; i < path.length - 1; i++)
    target = target[segments[i]];

  target[segments[i]] = value;
}
