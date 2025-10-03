/**
 * @overview Phoebe.js
 * @see {@link https://github.com/knrdl/phoebejs|GitHub}
 * @author knrdl
 * @license MIT
 * @version 0.0.0
 */

// This library consists of a single function with two parts:
// 1. utility functions: state management, code from template execution, attribute handling, rendering
// 2. structural elements: <phoebe-if>, <phoebe-for>, ...

// todo: split in multiple files and use rollup

/**
 * create the phoebe instance
 * @param {Record<string, any>} initialValues 
 * @param {Element} rootNode 
 */
function Phoebe(initialValues, rootNode = undefined) {
    rootNode = rootNode ?? document.body

    /** a registry to keep additional properties for dom nodes */
    const registry = (() => {
        /**@type {WeakMap<Element, object>} */
        const map = new WeakMap()

        /**
         * @param {Element} el 
         * @returns {Partial<{
         *  boundModel: boolean
         *  boundEvents: Set<string>
         *  originalStyle: string
         *  originalClass: string
         *  loopContextValue: object
         *  withContextValue: object
         *  contextAncestors: Array<Element> | false
         * }>}
         */
        return function (el) {
            if (!map.has(el)) map.set(el, {})
            return map.get(el)
        }
    })()


    /** utils to execute javascript snippets contained in phoebe strings */
    const js = (() => {
        /** @type {Map<string, Function>} */
        const cache = new Map()

        return {
            /**
             * get a value from a javascript expression
             * @param {string} expr 
             * @param {object} scope 
             * @param {Element} _this 
             */
            get(expr, scope, _this) {
                try {
                    const cache_key = 'get:' + expr
                    if (!cache.has(cache_key))
                        cache.set(cache_key, new Function("state", "scope", `with(state){ with(scope){ return (${expr}) } }`))
                    return cache.get(cache_key).call(_this, state, scope)
                } catch (e) {
                    console.error('Phoebe.js: error', e, 'executing js.get() with', expr, 'and scope', scope, 'on', _this)
                    throw e
                }
            },
            /**
             * assign a javascript expression a value 
             * @param {string} expr 
             * @param {any} value 
             * @param {object} scope 
             * @param {Element} _this 
             */
            set(expr, value, scope, _this) {
                try {
                    const cache_key = 'set:' + expr
                    if (!cache.has(cache_key))
                        cache.set(cache_key, new Function("state", "scope", "value", `with(state) { with(scope){ ${expr} = value } }`))
                    cache.get(cache_key).call(_this, state, scope, value)
                } catch (e) {
                    console.error('Phoebe.js: error', e, 'executing js.set() with', expr, '=', value, 'and scope', scope, 'on', _this)
                }
            },
            /**
             * execute a javascript expression
             * @param {string} expr 
             * @param {object} scope 
             * @param {Element} _this 
             */
            exec(expr, scope, _this) {
                try {
                    const cache_key = 'exec:' + expr
                    if (!cache.has(cache_key))
                        cache.set(cache_key, new Function("state", "scope", `with(state){ with(scope){ ${expr} } }`))
                    cache.get(cache_key).call(_this, state, scope)
                } catch (e) {
                    console.error('Phoebe.js: error', e, 'executing js.exec() with', expr, 'and scope', scope, 'on', _this)
                }
            }
        }
    })()


    /** reactive state of the phoebe instance */
    const state = (() => {
        /**@type {WeakMap<object, ProxyHandler>} */
        const cache = new WeakMap()

        /**
         * make state reactive
         * @template T
         * @param {T} target 
         * @returns {ProxyHandler<T>}
         */
        function wrap(target) {

            if (!target
                || typeof target !== "object"
                || (target instanceof Element)
                || (target instanceof Date)
                || (target instanceof RegExp)
            ) return target

            if (cache.has(target)) return cache.get(target)

            const proxy = new Proxy(target, {
                get(target, key, receiver) {
                    const value = Reflect.get(target, key, receiver)
                    return wrap(value) // wrap nested objects // todo: check value type here and save a recursive call
                },
                set(target, key, value, receiver) {
                    const old = target[key]
                    if (old !== value) renderer.schedule(rootNode)  // todo: don't rerender whole dom, track dependencies
                    return Reflect.set(target, key, value, receiver)
                },
                deleteProperty(target, key) {
                    const hadKey = key in target
                    if (hadKey) renderer.schedule(rootNode)  // todo: don't rerender whole dom, track dependencies
                    return Reflect.deleteProperty(target, key)
                }
            })

            cache.set(target, proxy)

            return proxy
        }

        return wrap(initialValues)
    })()


    /** handlers to apply phoebe directives to the dom */
    const directives = {
        /** 
         * two-way binding for the value of input elements: <input type="text" phoebe-bind="name" />
         * @param {Element} el
         * @param {string} expr
         * @param {object} scope
         */
        handleBinding(el, expr, scope) {
            if (!expr || expr.length === 0) return console.warn('Phoebe.js: phoebe-bind cannot be empty:', el)

            if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement))
                return console.warn('Phoebe.js: phoebe-bind should only be used on <input>, <textarea> and <select>, not on:', el)

            const value = js.get(expr, scope, el)
            if (el instanceof HTMLInputElement && el.type === 'checkbox') {
                el.checked = Array.isArray(value) ? value.includes(el.value) : !!value
            } else if (el instanceof HTMLInputElement && el.type === 'radio') {
                el.checked = value === el.value
            } else if (el instanceof HTMLInputElement && el.type === 'number') {
                if (!Number.isNaN(value))// don't clear input field on invalid input (e.g. minus sign without following number)
                    el.value = value
            } else {
                el.value = value ?? ''
            }

            if (!registry(el).boundModel) {
                registry(el).boundModel = true
                el.addEventListener('input', e => {
                    const t = /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} */ (e.target)
                    const newScope = renderer.buildScope(el)
                    if (t instanceof HTMLInputElement && t.type === 'checkbox') {
                        const binding = js.get(expr, newScope, el)
                        if (Array.isArray(binding)) {
                            if (t.checked && !binding.includes(t.value))
                                binding.push(t.value)
                            else if (!t.checked && binding.includes(t.value))
                                binding.splice(binding.indexOf(t.value), 1)
                        } else
                            js.set(expr, t.checked, newScope, el)
                    } else if (t instanceof HTMLInputElement && t.type === 'radio') {
                        if (t.checked) js.set(expr, t.value, newScope, el)
                    }
                    else if (t instanceof HTMLInputElement && (t.type === 'number' || t.type === 'range'))
                        js.set(expr, (/**@type {HTMLInputElement}*/(t)).valueAsNumber, newScope, el)
                    else
                        js.set(expr, t.value, newScope, el)
                })
            }
        },

        /**
         * conditional class rendering: `<span phoebe-class:red="balance < 0">Balance</span>`
         * @param {Element} el 
         * @param {string} className 
         * @param {string} expr 
         * @param {object} scope 
         */
        handleClass(el, className, expr, scope) {
            el.classList.toggle(className, !!js.get(expr, scope, el))
        },

        // todo: remove binding if element goes out of scope (phoebe-for & phoebe-if)
        /**
         * dom node to variable binding: `<dialog phoebe-ref="dialogElement"></dialog>`
         * @param {Element} el 
         * @param {string} expr 
         * @param {object} scope
         */
        handleReference(el, expr, scope) {
            js.set(expr, el, scope, el)
        },

        /**
         * scope events to the phoebe context: `<button phoebe:onclick="phoebeVar++">`
         * @param {Element} el 
         * @param {string} eventName 
         * @param {string} expr 
         */
        handleEvent(el, eventName, expr) {
            if (!registry(el).boundEvents) registry(el).boundEvents = new Set()
            if (!registry(el).boundEvents.has(eventName)) {
                el.addEventListener(eventName, event => {
                    const newScope = renderer.buildScope(el)
                    js.exec(expr, { ...newScope, event }, el)
                })
                registry(el).boundEvents.add(eventName)
            }
        },

        /**
         * update attribute values:
         * - `<input type="range" phoebe:value="rangeVar" />`
         * - `<input type="button" phoebe:disabled="inputText.length===0" />`
         * - `<span class="item" phoebe:class="isGood ? 'green' : 'red'">...</span>`
         * - `<span style="font-weight:bold" phoebe:style="isBad ? 'color:red' : ''">...</span>`
         * @param {Element} el 
         * @param {string} attrName
         * @param {string} expr
         * @param {object} scope 
         */
        handleAttribute(el, attrName, expr, scope) {
            const value = js.get(expr, scope, el)
            if (attrName === 'style') {
                if (registry(el).originalStyle === undefined)
                    registry(el).originalStyle = (el.getAttribute('style') ?? '').trim()
                /** @type {string} */
                let computedStyle = (value ?? '').toString().trim()

                let originalStyle = /** @type {string} */ (registry(el).originalStyle)

                if (computedStyle.length > 0 || originalStyle.length > 0) {
                    let newStyle = originalStyle
                    if (newStyle.length > 0 && computedStyle.length > 0 && !newStyle.endsWith(';'))
                        newStyle += ';'
                    newStyle += computedStyle
                    el.setAttribute('style', newStyle)
                } else el.removeAttribute('style')
            } else if (attrName === 'class') {
                if (registry(el).originalClass === undefined)
                    registry(el).originalClass = (el.getAttribute('class') ?? '').trim()
                el.setAttribute(attrName, (registry(el).originalClass + ' ' + (value ?? '').toString()).trim())
            } else {
                if (value === undefined || value === null || value === false) el.removeAttribute(attrName)
                else if (value === true) el.setAttribute(attrName, attrName)  // e.g. required="required" or disabled="disabled"
                else el.setAttribute(attrName, value)
            }
        }
    }


    /** coordinate dom manipulation */
    const renderer = (() => {
        /** @type {Set<Element>} */
        let rerenderEls = new Set()

        /**
         * @param {Element} el
         */
        function schedule(el) {
            if (rerenderEls.size === 0) {
                setTimeout(() => {
                    rerenderEls.forEach(rerenderEl => {
                        rerenderEls.delete(rerenderEl)
                        renderTree(rerenderEl)
                    })
                }, 33)  // render at 30fps max
                rerenderEls.add(el)
            } else if (!rerenderEls.has(el)) {
                let shouldAdd = true
                for (const rerenderEl of rerenderEls)
                    if (rerenderEl.contains(el)) {
                        shouldAdd = false
                        break
                    }
                if (shouldAdd) rerenderEls.add(el)
            }
        }

        /** 
         * `<phoebe-for>` elements set a context via item and index variable. 
         * the scope of an element is the combined context of all ancestor `<phoebe-for>` & `<phoebe-with>` elements
         * @param {Element} el 
         */
        function buildScope(el) {
            /** @type {object} */
            let scope = {}

            if (registry(el).contextAncestors === undefined) {
                /** @type {Element[]} */
                let loopEls = []

                /** @type {Element | null} */
                let parent = el

                while (parent && parent !== rootNode) {
                    if (registry(parent).loopContextValue || registry(parent).withContextValue) loopEls.push(parent)
                    parent = parent.parentElement
                }

                registry(el).contextAncestors = (loopEls.length > 0) ? loopEls : false
            }


            const ancestors = registry(el).contextAncestors
            if (ancestors)
                for (const anc of ancestors) {
                    const reg = registry(anc)
                    if (reg.loopContextValue) scope = { ...scope, ...reg.loopContextValue }
                    if (reg.withContextValue) scope = { ...scope, ...reg.withContextValue }
                }

            return scope
        }


        /** 
         * @param {Element} root
         * @param {(el: Element) => void} callback
         */
        function traverseDom(root, callback) {
            if (!root) return

            const stack = [root]
            while (stack.length > 0) {
                const el = stack.pop()
                if (!(el instanceof Element)) continue

                callback(el)

                // Push children in reverse order so they are processed in DOM order
                let child = el.lastElementChild
                while (child instanceof Element) {
                    stack.push(child)
                    child = child.previousElementSibling
                }
            }
        }

        /** 
         * @param {Element} el 
         */
        function processElement(el) {
            /**@type {object} */
            let scope = undefined

            if (el instanceof PhoebeElement) {
                scope = buildScope(el)
                el.render(scope)
            }

            const phoebeAttrs = el.getAttributeNames().filter(attr => attr.startsWith("phoebe"))
            if (phoebeAttrs.length > 0) {
                if (!scope) scope = buildScope(el)
                phoebeAttrs.sort((a, b) => +(a === "phoebe:class") - +(b === "phoebe:class"))  // execute phoebe:class="xxx yyy" before phoebe-class:xxx="expr"
                phoebeAttrs.forEach(attrName => {
                    if (attrName === 'phoebe-bind')
                        directives.handleBinding(el, /**@type {string!}*/(el.getAttribute(attrName)), scope)
                    else if (attrName === 'phoebe-ref')
                        directives.handleReference(el, /**@type {string!}*/(el.getAttribute(attrName)), scope)
                    else if (attrName.startsWith('phoebe-class:'))
                        directives.handleClass(el, attrName.substring('phoebe-class:'.length), /**@type {string!}*/(el.getAttribute(attrName)), scope)
                    else if (attrName.startsWith('phoebe:on') && attrName.length > 'phoebe:on'.length)
                        directives.handleEvent(el, attrName.substring('phoebe:on'.length), /**@type {string!}*/(el.getAttribute(attrName)))
                    else if (attrName.startsWith('phoebe:') && attrName.length > 'phoebe:'.length)
                        directives.handleAttribute(el, attrName.substring('phoebe:'.length), /**@type {string!}*/(el.getAttribute(attrName)), scope)
                    else
                        console.warn('Phoebe.js: Unknown attribute', attrName, 'found at', el)
                })
            }
        }

        /**
         * @param {Element} el 
         */
        function renderTree(el) {
            if (el.isConnected) // filter out elements in <template> as these don't need to be rendered
                traverseDom(el, el => {
                    processElement(el)
                })
        }

        return { renderTree, schedule, buildScope }
    })()



    /**
     * base class for all phoebe structural elements
     * @abstract 
     */
    class PhoebeElement extends HTMLElement {

        constructor() {
            super()
            renderer.schedule(this)
        }

        /**
         * update the element
         * @abstract
         * @param {object} scope 
         */
        render(scope) { }  // eslint-disable-line @typescript-eslint/no-unused-vars
    }


    class PhoebeFor extends PhoebeElement {
        /**@type {Map<any, Element>} */
        #keyElements = undefined

        /**@type {number | null} */
        #cleanupTimeoutHandle = null

        connectedCallback() {
            if (this.#cleanupTimeoutHandle) {
                clearTimeout(this.#cleanupTimeoutHandle)
                this.#cleanupTimeoutHandle = null
            }
        }

        disconnectedCallback() {
            //cleanup rendered items to save memory, if this element is permanently removed from DOM.
            //setTimeout is necessary because the element also gets disconnected when moved into a template, e.g. by an ancestor <phoebe-if>
            this.#cleanupTimeoutHandle = setTimeout(() => {
                if (!this.isConnected && this.isInitDone) {
                    this.replaceChildren(this.firstChild) // keep only the template
                    this.#keyElements = undefined
                }
            }, 0)
        }

        get hasExactlyOneChild() {
            let foundOne = false
            for (const node of this.childNodes)
                if (node.nodeType === Node.ELEMENT_NODE ||
                    (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim() !== "")) {
                    if (foundOne) return false
                    foundOne = true
                }
            return foundOne
        }

        get isInitDone() {
            const template = /**@type {HTMLTemplateElement?} */ (this.firstChild)
            return template?.dataset?.phoebeRole === 'for'
        }

        /**
         * @param {object} scope 
         */
        render(scope) {
            if (!this.isInitDone) {
                const template = document.createElement('template')
                template.dataset.phoebeRole = 'for'

                if (!this.hasExactlyOneChild) {
                    console.debug('Phoebe.js: <phoebe-for> should have exactly one child element. wrapping children in a <div> in:', this)
                    const div = document.createElement('div')
                    div.replaceChildren(...this.childNodes)
                    this.appendChild(div)
                }

                template.content.replaceChildren(...this.childNodes)
                this.appendChild(template)
                this.style.display = "contents"
            }

            const template = /**@type {HTMLTemplateElement} */ (this.firstChild)

            const varName = this.getAttribute('var') // todo: variable expression ... varExpr: with ([a,b]=__phoebeLoopVariable) {console.log(b)}
            const iterExpr = this.getAttribute('in')
            const indexName = this.getAttribute('index')

            const isKeyedLoop = this.hasAttribute('key')

            let iterObj = js.get(iterExpr, scope, this)

            // ensure iterObj is iterable
            if (typeof iterObj === 'number') {
                if (iterObj >= 0) iterObj = Array(iterObj).keys() // count N times
                else {
                    console.warn('Phoebe.js: <phoebe-for> attribute "in" cannot be a negative number:', iterObj)
                    iterObj = []
                }
            } else if (iterObj === null || iterObj === undefined || typeof iterObj[Symbol.iterator] !== 'function') {
                console.warn('Phoebe.js: <phoebe-for> attribute "in" expects an iterable (like an array), not:', iterObj)
                iterObj = []
            }

            if (isKeyedLoop) { // loop with stable keys: insert missing items, move and update existing items if necessary, remove superfluous items

                if (!this.#keyElements)
                    this.#keyElements = new Map()

                const keyExpr = this.getAttribute('key')
                const visitedKeys = new Set()
                let currentEl = template.nextElementSibling

                // render loop items
                let index = 0
                for (const item of iterObj) {// use for..of loop because not every iterable implements .forEach()

                    const ctx = {}
                    if (varName) ctx[varName] = item
                    if (indexName) ctx[indexName] = index

                    const key = js.get(keyExpr, { ...scope, ...ctx }, this)

                    if (!(typeof key === 'string' || typeof key === 'number') || Number.isNaN(key)) {
                        console.warn('Phoebe.js: the key for a <phoebe-for> loop should be a unique string or number. Found', key, 'on', this)
                    } else if (visitedKeys.has(key)) {
                        console.warn('Phoebe.js: found duplicated key', key, 'for <phoebe-for> loop', this, 'Loop keys must be unique!')
                    }

                    visitedKeys.add(key)

                    if (this.#keyElements.has(key)) {
                        const keyEl = this.#keyElements.get(key)
                        if (!currentEl || keyEl !== currentEl) // move item
                            this.insertBefore(keyEl, currentEl ? currentEl.nextElementSibling : null)

                        registry(keyEl).loopContextValue = ctx
                        currentEl = keyEl.nextElementSibling
                    } else { // create item
                        const clone = /** @type {DocumentFragment} */ (template.content.cloneNode(true))
                        const newEl = clone.firstElementChild  // cannot be null as init ensures at least a <div>
                        this.#keyElements.set(key, newEl)
                        this.insertBefore(newEl, currentEl ? currentEl.nextElementSibling : null)

                        registry(newEl).loopContextValue = ctx
                        currentEl = newEl.nextElementSibling
                    }

                    index++
                }

                // prune old items
                for (const [key, el] of this.#keyElements)
                    if (!visitedKeys.has(key)) {
                        el.remove()
                        this.#keyElements.delete(key)
                    }

            } else { // loop without stable keys: update each item, insert items if necessary, remove superfluous items

                let currentEl = template.nextElementSibling

                // render loop items
                let index = 0
                for (const item of iterObj) {// use for..of loop because not every iterable implements .forEach()

                    const ctx = {}
                    if (varName) ctx[varName] = item
                    if (indexName) ctx[indexName] = index

                    const existingEl = currentEl

                    if (!existingEl) {
                        const clone = /** @type {DocumentFragment} */ (template.content.cloneNode(true))
                        const newEl = clone.firstElementChild  // cannot be null as init ensures at least a <div>
                        this.insertBefore(newEl, null)

                        registry(newEl).loopContextValue = ctx

                        // currentEl stays null
                    } else {
                        registry(existingEl).loopContextValue = ctx

                        currentEl = currentEl.nextElementSibling
                    }

                    index++
                }

                // prune old items
                while (currentEl) {
                    const nextEl = currentEl.nextElementSibling
                    currentEl.remove()
                    currentEl = nextEl
                }
            }
        }
    }
    window.customElements.define('phoebe-for', PhoebeFor)


    // todo: phoebe-else
    // todo: transitions & delay (for loading screens etc)
    class PhoebeIf extends PhoebeElement {

        constructor() {
            super()

            const trueHandler = this.getAttribute('ontrue')
            if (trueHandler)
                this.addEventListener('true', () => js.exec(trueHandler, renderer.buildScope(this), this))

            const falseHandler = this.getAttribute('onfalse')
            if (falseHandler)
                this.addEventListener('false', () => js.exec(falseHandler, renderer.buildScope(this), this))
        }

        /**
         * @param {object} scope 
         */
        render(scope) {
            let isInitRender = false
            if ((/**@type {HTMLElement?} */(this.firstChild))?.dataset?.phoebeRole !== 'if') {  // init
                isInitRender = true
                const template = document.createElement('template')
                template.dataset.phoebeRole = 'if'
                template.content.replaceChildren(...this.childNodes)
                this.appendChild(template)
                this.style.display = "contents"
            }

            const template =/**@type {HTMLTemplateElement} */ (this.firstChild)

            const shouldShow = !!js.get(this.getAttribute('if'), scope, this)
            const isShowing = template.content.childNodes.length === 0

            if (shouldShow && !isShowing) {
                this.replaceChildren(template, ...template.content.childNodes)
                if (!isInitRender) this.dispatchEvent(new CustomEvent('true'))
            } else if (!shouldShow && isShowing) {
                while (template.nextSibling)
                    template.content.appendChild(template.nextSibling)
                if (!isInitRender) this.dispatchEvent(new CustomEvent('false'))
            }

        }
    }
    window.customElements.define('phoebe-if', PhoebeIf)


    class PhoebeText extends PhoebeElement {
        /**
         * @param {object} scope 
         */
        render(scope) {
            if (this.dataset.textTemplate === undefined) {  // init
                if (this.childElementCount > 0)
                    console.warn('Phoebe.js: <phoebe-text> should only contain text, not other elements', this)

                let templateExpr = (this.textContent ?? '').trim()
                if (templateExpr.includes('`')) {
                    templateExpr = templateExpr.replace(/`/g, '')
                    console.warn('Phoebe.js: <phoebe-text> may not include backticks:', this)
                }

                this.dataset.textTemplate = '`' + templateExpr + '`'
                this.textContent = ''
                this.style.display = 'inline'
            }
            this.textContent = js.get(this.dataset.textTemplate, scope, this)
        }
    }
    window.customElements.define('phoebe-text', PhoebeText)


    // todo: attribute "instant" to support exec on mount
    // todo: attribute "after" to support setTimeout instead of setInterval
    class PhoebeTimer extends PhoebeElement {
        #handle = undefined
        #shouldRun = false
        #scope = {}
        #expr = ''
        #interval = 0

        connectedCallback() {
            const expr = this.getAttribute('do')
            const intervalStr = (this.getAttribute('every') ?? '').trim()
            const interval = parseFloat(intervalStr)

            if (expr && !Number.isNaN(interval) && (intervalStr.endsWith('ms') || intervalStr.endsWith('s'))) {
                const isSeconds = !intervalStr.endsWith('ms')
                this.#expr = expr
                this.#interval = isSeconds ? interval * 1000 : interval
                this.#shouldRun = true
                renderer.schedule(this)  // setInterval() is started in this.render(), so trigger a rendering
            } else {
                console.warn('Phoebe.js: <phoebe-timer> attributes "do" and "every" are required and "every" must be a number in seconds (s) or milliseconds (ms):', this)
                // this.#shouldRun stays false
            }

        }

        disconnectedCallback() {
            this.#shouldRun = false
            window.clearInterval(this.#handle)
            this.#handle = undefined
        }

        /**
         * @param {object} scope 
         */
        render(scope) {
            this.#scope = scope  // scope might change on every render, so store it 

            if (this.#shouldRun && this.#handle === undefined) {
                this.#shouldRun = false
                this.#handle = window.setInterval(() => js.exec(this.#expr, this.#scope, this), this.#interval)
            }
        }
    }
    window.customElements.define('phoebe-timer', PhoebeTimer)


    class PhoebeWith extends PhoebeElement {
        /**
         * @param {object} scope 
         */
        render(scope) {
            const varName = this.getAttribute('var')
            const expr = this.getAttribute('is')
            if (varName && expr)
                registry(this).withContextValue = { [varName]: js.get(expr, scope, this) }
            else console.warn('Phoebe.js: <phoebe-with> attributes "var" and "is" are required:', this)
        }
    }
    window.customElements.define('phoebe-with', PhoebeWith)


    class PhoebeComponent extends PhoebeElement {
        connectedCallback() {
            const url = this.getAttribute('src')
            const templateId = this.getAttribute('template-id')
            if (url && templateId) {
                console.warn('Phoebe.js: <phoebe-component> can either have "src" or "template-id". not both:', this)
            } else if (url) {
                fetch(url).then(async res => {
                    if (res.ok) {
                        this.innerHTML = await res.text()
                        renderer.schedule(this)
                        this.dispatchEvent(new CustomEvent('load'))
                    }
                    else throw new Error(await res.text())
                }).catch(e => {
                    this.dispatchEvent(new CustomEvent('error', { detail: e.message }))
                })
            } else if (templateId) {
                const template = document.getElementById(templateId)
                if (!template)
                    return this.dispatchEvent(new CustomEvent('error', { detail: 'Unknown template id' }))
                if (!(template instanceof HTMLTemplateElement))
                    return this.dispatchEvent(new CustomEvent('error', { detail: 'Template must be a <template> element' }))
                const clone = template.content.cloneNode(true)
                this.replaceChildren(...clone.childNodes)
                renderer.schedule(this)
            }
        }
    }
    window.customElements.define('phoebe-component', PhoebeComponent)



    renderer.renderTree(rootNode)
    return state
}

export default Phoebe