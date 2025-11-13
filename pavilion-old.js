function getFromPath(path, target) {
  return path.split('.').reduce((o,i)=> o[i], target);
}

function setOnPath(target, value, path) {
  let i;
  path = path.split('.');

  for (i = 0; i < path.length - 1; i++)
    target = target[path[i]];

  target[path[i]] = value;
}

function createNestedProxy(source, onChange, parent) {
  return new Proxy(source, {
    get(target, property) {
      const path = [parent, property].join('.');
      const item = target[property];
      if (property === '$valuePath') return path.split('.').slice(0, -1).join('.').replace(/^\./, '');
      if (item && typeof item === 'object') return createNestedProxy(item, onChange, path);
      return item;
    },
    set(target, property, newValue, reciever) {
      target[property] = newValue;
      onChange(target, property, newValue, reciever);
      return true;
    },
  })
}

function patchNodes(valuePath, component) {
  const deps = component.dependencyMap[valuePath] || [];

  deps.forEach(dep => {
    switch (dep.node.nodeType) {
      case dep.node.TEXT_NODE:
        dep.node.nodeValue = dep.template.replaceAll(new RegExp(`\{\{ ?${valuePath} ?\}\}`, 'g'), getFromPath(valuePath, component.data));
        break;

      case dep.node.ELEMENT_NODE:
        switch (dep.node.tagName.toLowerCase()) {
          case 'input':
            const type = dep.node.getAttribute('type');

            if (['text', 'number'].includes(type)) {
              dep.node.value = getFromPath(valuePath, component.data);
            }

            if (['checkbox'].includes(type)) {
              dep.node.checked = getFromPath(valuePath, component.data);
            }
            break;

          default:
            break;
        }
        break;

      default:
        break;
    }
  });
}

/**
 *
 * @param {ChildNode} node
 * @param {Component} component
 */
function attachEventListeners(node, component) {
  const eventAttributes = node
    .getAttributeNames()
    .filter(el => el.startsWith('@'));

  eventAttributes.forEach(eventName => {
    const handler = component[node.getAttribute(eventName)];

    if (handler) {
      node.addEventListener(eventName.replace('@', ''), handler.bind(component));
    }
  });

  const binding = node.dataset.bind;

  if (binding) {
    if (node.tagName.toLowerCase() === 'input') {
      const type = node.getAttribute('type');
      node.addEventListener('input', (event) => {
        if (['text', 'number'].includes(type)) {
          setOnPath(component.data, event.target.value, binding);
        }

        if (['checkbox'].includes(type)) {
          setOnPath(component.data, event.target.checked, binding);
        }
      });
    }

    if (node.tagName.toLowerCase() === 'select') {
      node.addEventListener('change', (event) => {
        setOnPath(component.data, event.target.value, binding);
      });
    }
  }

}

/**
 *
 * @param {ChildNode} node
 * @param {Component} component
 */
function collectDependencies(node, component) {

  if (node.nodeType === node.TEXT_NODE) {
    const found = node.nodeValue.matchAll(/\{\{(.*?)\}\}/gm);

    for (const match of found) {
      const varKey = match[1].trim();

      if (!component.dependencyMap[varKey]) {
        component.dependencyMap[varKey] = [];
      }

      component.dependencyMap[varKey].push({
        node,
        template: node.nodeValue,
      });
    }
  }

  if (node.nodeType === node.ELEMENT_NODE) {
    const varKey = node.dataset.bind;

    if (varKey) {
      if (!component.dependencyMap[varKey]) {
        component.dependencyMap[varKey] = [];
      }

      component.dependencyMap[varKey].push({
        node,
      });
    }

    attachEventListeners(node, component);
  }

  node.childNodes.forEach(el => collectDependencies(el, component));
}

/**
 *
 * @param {HTMLElement} element
 * @param {string} templatePath
 * @param {Component} component
 */
function renderTemplate(element, templatePath, component) {
  const template = templatePath ? document.querySelector(templatePath) : element;
  let html = template.innerHTML;
  const elementDisplayStyle = element.style.display;

  element.style.display = 'none';
  element.innerHTML = html;
  element.childNodes.forEach(el => collectDependencies(el, component));
  Object.keys(component.dependencyMap).forEach(key => patchNodes(key, component));
  element.style.display = elementDisplayStyle;
}

let componentUid = 1;

export class Component {
  dependencyMap = {};

  constructor(options) {
    this.uid = componentUid++;

    if (options.el) {
      this.$el = document.querySelector(options.el);

      if (this.$el) {
        this.$el.setAttribute('data-component', this);
      }
    } else {
      throw new Error('No mounting point was provided in component constructor');
    }

    this.data = createNestedProxy(options.data(), (target, key, value, reciever) => {
      target[key] = value;
      const path = [reciever.$valuePath, key].filter(e => e).join('.');

      patchNodes(path, this);

      if (options.updated && typeof options.updated === 'function') {
        options.updated.call(this, key, value, target);
      }

      if (options.watch) {
        const watchHandler = options.watch[path];

        if (watchHandler) {
          watchHandler.call(this, value);
        }
      }
    });

    if (options.methods) {
      Object.keys(options.methods).forEach(method => {
        if (!this[method]) {
          this[method] = (options.methods[method]).bind(this);
        }
      });
    }

    if (options.created && typeof options.created === 'function') {
      options.created.call(this);
    }

    if (this.$el) {
      renderTemplate(this.$el, options.template, this);
    }

    if (options.mounted && typeof options.mounted === 'function') {
      options.mounted.call(this);
    }
  }
}
