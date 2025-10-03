# phoebe.js

Phoebe.js is a lightweight, dependency-free JavaScript library that lets you add reactivity, bindings, and control structures to your HTML. Write plain HTML, add a few attributes, and your UI updates automatically when something changes - no build step required.

<div style="text-align:center" align="center">
<img src="logo.png" width="200" alt="Phoebe.js logo">
</div>

## ✨ Features
* **Reactive state**: Declare your state once, let Phoebe update the DOM automatically.
* **Dynamic attributes**: Toggle classes, styles, and attributes based on state.
* **Two-way binding**: `phoebe-bind` keeps inputs and state in sync.
* **Control structures**:
    * `<phoebe-if>` for conditionals
    * `<phoebe-for>` for loops
    * `<phoebe-with>` for scoped variables
    * `<phoebe-timer>` for repeated execution
    * `<phoebe-component>` for reusable snippets
* **Text templating**: `<phoebe-text>` allows you to format your variables for output.


## 🚀 Getting Started

### Installation

```html
<head>
    <link href="./src/phoebe.css" rel="stylesheet">
</head>

<script type="module">
    import Phoebe from './src/phoebe.js'
    window.phoebe = Phoebe({
        // define your variables and methods here
    })
</script>
```

### Quick Example

```html
<!DOCTYPE html>
<head>
    <link href="./src/phoebe.css" rel="stylesheet">
</head>


<input type="text" phoebe-bind="shopping.newItem" phoebe:style="`width: ${shopping.newItem.length+3}ch`" />

<button type="button" phoebe:disabled="shopping.newItem.length === 0" phoebe:onclick="shopping.addItem()">+</button>


<phoebe-if if="shopping.items.length === 0">
    List is empty
</phoebe-if>

<ul>
    <phoebe-for var="item" in="shopping.items" index="idx">
        <li>
            <phoebe-text>Item: ${item}</phoebe-text>
            <button type="button" phoebe:onclick="shopping.removeItem(idx)">-</button>
        </li>
    </phoebe-for>
</ul>

<script type="module">
    import Phoebe from './src/phoebe.js'
    window.phoebe = Phoebe({
        shopping: {
            newItem: '',
            addItem() {
                this.items.push(this.newItem)
                this.newItem = ''
            },
            removeItem(index) {
                this.items.splice(index, 1)
            },
            items: ["Apples", "Bananas", "Tomatos"]
        }
    })
</script>
```

### Complete walkthrough

Have a look at the [phoebe-by-example.html](docs/phoebe-by-example.html) file.

## ⚠️ Caveats

* Write phoebe attributes (e.g. `phoebe:value`) always as text literals (like this: `phoebe:value="count / 100"`). Never fill them via javascript with dynamic values (like untrusted user provided input). Otherwise your app may be subject to XSS attacks (script injection).
* Currently, all state changes schedule a complete re-render. Dependency tracking and fine-grained updates are on the roadmap.

## ⚖️ phoebe.js vs alpine.js

| Aspect | **phoebe.js** | **alpine.js** |
| ------ | ------------- | ------------- |
| **Status** | experimental | stable |
| **Size** | ~10KiB | ~40KiB |
| **Syntax** | tags (`<phoebe-if>`, `<phoebe-for>`, `<phoebe-text>`, ...) and attributes (`phoebe-bind`, `phoebe-class`, `phoebe-ref`, ...). | Purely attributes (`x-if`, `x-for`, `x-text`, ...), no new tags introduced. |
| **Reactivity** | Basic implementation | Advanced reactivity with dependency tracking. Updates are usually more efficient out of the box. |
| **External Components** | `<phoebe-component src="...">` to load external HTML or `<template>` by ID. | Out of scope. |
| **Learning Curve** | Familiar HTML with custom elements. Looks like declarative HTML templates. | Attribute-driven. More similar to Vue.js |
| **Target Audience** | Developers who need a basic utility to manipulate the DOM | Developers who are used to more advanced solutions (like Vue.js or Svelte) |

## 📌 Roadmap
- [ ] Split code into modules, bundle with Rollup
- [ ] Smarter reactivity (fine-grained dependency tracking)
- [ ] Transition/animation hooks
