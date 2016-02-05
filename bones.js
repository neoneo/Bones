(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory);
	} else {
		root.Bones = factory();
	}
})(this, function () {
	'use strict'

	// HELPER FUNCTIONS

	function slide(controller, next) {
		var transitioned = false
		var transform = controller.orientation === 'horizontal' ? 'translateX' : 'translateY'
		var currentChild = controller.currentChild
		var relatedChild
		currentChild.pane.style.transform = transform + '(0)'
		if (next && controller.hasPrevious) {
			transitioned = true
			relatedChild = controller.previousChild
			relatedChild.pane.style.transform = transform + '(-' + controller.translateOut + '%)'
		} else if (!next && controller.hasNext) {
			transitioned = true
			relatedChild = controller.nextChild
			relatedChild.pane.style.transform = transform + '(100%)'
		}
		if (transitioned) {
			// Only trigger events when we transitioned to another pane.
			// Tell the parent a slide is going to happen, and in which direction.
			controller.trigger('beforeslide', {detail: {next: next}, cancelable: false, bubbles: false, trickles: false})

			relatedChild.trigger('beforeslideout', {cancelable: false, bubbles: true, trickles: true})
			relatedChild.pane.addEventListener('transitionend', function translateOut(e) {
				if (e.propertyName === 'transform') {
					relatedChild.trigger('afterslideout', {cancelable: false, bubbles: true, trickles: true})
					e.target.removeEventListener('transitionend', translateOut)
				}
			})

			currentChild.trigger('beforeslidein', {cancelable: false, bubbles: true, trickles: true})
			currentChild.pane.addEventListener('transitionend', function translateIn(e) {
				if (e.propertyName === 'transform') {
					currentChild.trigger('afterslidein', {cancelable: false, bubbles: true, trickles: true})
					controller.trigger('afterslide', {detail: {next: next}, cancelable: false, bubbles: false, trickles: false})
					e.target.removeEventListener('transitionend', translateIn)
				}
			})
		}
	}

	function arrange(controller) {
		var transform = controller.orientation === 'horizontal' ? 'translateX' : 'translateY'
		controller.children.forEach(function (child, index) {
			if (index < controller.currentIndex) {
				child.pane.style.transform = transform + '(-' + controller.translateOut + '%)'
			} else if (index > controller.currentIndex) {
				child.pane.style.transform = transform + '(100%)'
			} else {
				child.pane.style.transform = transform + '(0)'
			}
		})
	}

	// Defines the properties on the given prototype.
	function extend(prototype, properties) {
		Object.keys(properties).forEach(function (name) {
			Object.defineProperty(prototype, name, Object.getOwnPropertyDescriptor(properties, name))
		})
	}

	// Observe insertion and removal of panes and dispatch a custom event.
	var observer = new MutationObserver(function(records) {
		var events = {
			addedNodes: 'bones:insert',
			removedNodes: 'bones:remove'
		}
		records.forEach(function (record) {
			Object.keys(events).forEach(function (key) {
				var nodeList = record[key]
				if (nodeList.length) {
					Array.prototype.forEach.call(nodeList, function (node) {
						if (node.nodeType === 1 && Bones.isPane(node)) {
							node.dispatchEvent(new CustomEvent(events[key], {bubbles: false, cancelable: false}))
						}
					})
				}
			})
		})
	})
	observer.observe(document, {childList: true, subtree: true})

	// CONTROLLER IMPLEMENTATIONS

	/**
	 * Controller
	 * This controller basically only implements framework event handling.
	 */
	var Controller = (function () {
		/**
		 * Controller constructor
		 * pane 		DOM node
		 * properties	hash containing any properties applicable to this controller
		 *
		 * This controller does not require any properties.
		 */
		function Controller(pane, properties) {
			this._pane = pane
			this._parent = null
			this._listeners = {}
		}
		Controller.prototype = {
			get pane() {
				return this._pane
			},
			get parent() {
				return this._parent
			},
			set parent(parent) {
				this._parent = parent
			},
			on: function (type, listener) {
				type.split(' ').forEach(function (type) {
					var listeners = this._listeners[type]
					if (!listeners) {
						listeners = this._listeners[type] = []
					}
					if (listeners.indexOf(listener) === -1) {
						listeners.push(listener)
					}
				}, this)
			},
			off: function (type, listener) {
				type.split(' ').forEach(function (type) {
					var listeners = this._listeners[type]
					if (listeners) {
						var index = listeners.indexOf(listener)
						if (index > -1) {
							listeners.splice(index, 1)
						}
					}
				}, this)
			},
			trigger: function (type, options) {
				var event = new Event(type, this, options)
				handleEvent(this, event)
				return !event.defaultPrevented
			},
			render: function () {
				// Should be implemented by subclasses.
			}
		}

		function Event(type, controller, options) {
			var options = options || {}

			this._type = type
			this._controller = controller
			this._bubbles = options.bubbles === undefined ? true : options.bubbles
			this._trickles = options.trickles === undefined ? false : options.trickles
			this._cancelable = options.cancelable === undefined ? true : options.cancelable
			this._detail = options.detail

			this._phase = Event.NONE
			this._propagationStopped = !this._bubbles
			this._defaultPrevented = false
		}
		Event.NONE = 0
		Event.TRICKLING_PHASE = 1
		Event.AT_TARGET = 2
		Event.BUBBLING_PHASE = 3
		Event.prototype = {
			get type() {
				return this._type
			},
			get controller() {
				return this._controller
			},
			get detail() {
				return this._detail
			},
			stopPropagation: function () {
				if (this._phase > Event.TRICKLING_PHASE) {
					this._propagationStopped = true
				}
			},
			preventDefault: function () {
				if (this._phase > Event.TRICKLING_PHASE && this._cancelable) {
					this._defaultPrevented = true
				}
			},
			get defaultPrevented() {
				return this._defaultPrevented
			}
		}

		function handleEvent(controller, event) {
			if (event._phase <= Event.TRICKLING_PHASE) {
				if (event._trickles) {
					event._phase = Event.TRICKLING_PHASE
					var childList = controller.childList
					if (childList && childList.length) {
						childList.forEach(function (child) {
							handleEvent(child, event)
						})
					}
				}
				if (controller === event.controller) {
					event._phase = Event.AT_TARGET
				}
			}
			var listeners = controller._listeners[event.type]
			if (listeners && listeners.length) {
				listeners.forEach(function (listener) {
					listener.call(controller, event)
				})
			}
			if (event._phase > Event.TRICKLING_PHASE) {
				if (event._bubbles && !event._propagationStopped && controller.parent) {
					event._phase = Event.BUBBLING_PHASE
					handleEvent(controller.parent, event)
				} else {
					event._phase = Event.NONE
				}
			}
		}

		return Controller
	})()

	/**
	 * StackController
	 * The stack controller has an array of child controllers (the stack) that is swiped through in order.
	 */
	var StackController = (function () {
		function StackController(pane, properties) {
			Bones.Controller.call(this, pane, properties)
			this._children = []
			this._orientation = properties.orientation || 'horizontal'
			this._swipe = properties.swipe || false
			this._overflow = properties.overflow || 'spring' // What to do if the user swipes past the first or last pane? 'spring', 'propagate' or 'none'
			this._translateOut = properties.translateOut === undefined ? Bones.translateOut : properties.translateOut
			this._threshold = properties.threshold === undefined ? Bones.threshold : properties.threshold
			this._currentIndex = 0
			if (this._swipe) {
				Bones.enableSwiping(this)
			}
		}
		StackController.prototype = Object.create(Controller.prototype)
		StackController.prototype.constructor = StackController
		extend(StackController.prototype, {
			get children() {
				return this._children
			},
			get childList() {
				return this.children
			},
			get swipe() {
				return this._swipe
			},
			get orientation() {
				return this._orientation
			},
			get overflow() {
				return this._overflow
			},
			get threshold() {
				return this._threshold
			},
			get translateOut() {
				return this._translateOut
			},
			get currentIndex() {
				return this._currentIndex
			},
			get currentChild() {
				return this.children[this.currentIndex]
			},
			get nextChild() {
				return this.children[this.currentIndex + 1]
			},
			get previousChild() {
				return this.children[this.currentIndex - 1]
			},
			append: function (child) {
				child.parent = this
				this.pane.appendChild(child.pane)
				this._children.push(child)
				arrange(this)
			},
			prepend: function (child) {
				if (!this.children.length) {
					this.append(child)
				} else {
					child.parent = this
					this.pane.insertBefore(child.pane, this.children[0].pane)
					this._children.unshift(child)
					this._currentIndex += 1
					arrange(this)
				}
			},
			remove: function (child) {
				var index = this._children.indexOf(child)
				if (index > -1) {
					this._children.splice(index, 1)
					this.pane.removeChild(child.pane)
					arrange(this)
				}
			},
			next: function () {
				if (this.hasNext) {
					this._currentIndex += 1
					slide(this, true)
					return this.currentChild
				}
				return undefined
			},
			get hasNext() {
				return this._currentIndex < this.children.length - 1
			},
			previous: function () {
				if (this.hasPrevious) {
					this._currentIndex -= 1
					slide(this, false)
					return this.currentChild
				}
				return undefined
			},
			get hasPrevious() {
				return this._currentIndex > 0
			},
			render: function () {
				this.children.forEach(function (child) {
					child.render()
				})
			}
		})

		return StackController
	})()

	/**
	 * BrowseController
	 * The shift controller contains children accessible by name.
	 */
	var BrowseController = (function () {
		function BrowseController(pane, properties) {
			Bones.Controller.call(this, pane, properties)
			this._children = {}
			this._currentName = ''
			this._translateOut = properties.translateOut !== undefined ? properties.translateOut : Bones.translateOut
		}
		BrowseController.prototype = Object.create(Controller.prototype)
		BrowseController.prototype.constructor = BrowseController
		extend(BrowseController.prototype, {
			get children() {
				return this._children
			},
			get childList() {
				return Object.keys(this.children).map(function (name) {
					return this.children[name]
				}, this)
			},
			get currentName() {
				return this._currentName
			},
			get currentChild() {
				return this.children[this.currentName]
			},
			get translateOut() {
				return this._translateOut
			},
			add: function (child, name) {
				this._children[name] = child
				this.pane.appendChild(child.pane)
				if (this._currentName === '') {
					this._currentName = name
				} else {
					child.pane.style.visibility = 'hidden'
				}
			},
			render: function () {
				Object.keys(this.children).forEach(function (name) {
					var child = this.children[name]
					child.render()
					this.pane.appendChild(child.pane)
				}, this)
			},
			slideIn: function (name, from) {
				var controller = this._children[name]
				var x, y, z
				if (from === 'right') {
					x = '100%'
					y = '0%'
					z = 1
				} else if (from === 'left') {
					x = '-' + this.translateOut + '%'
					y = '0%'
					z = 0
				} else if (from === 'bottom') {
					x = '0%'
					y = '100%'
					z = 1
				} else if (from === 'top') {
					x = '0%'
					y = '-' + this.translateOut + '%'
					z = 0
				}
				this.currentChild.pane.style.zIndex = z === 1 ? 0 : 1
				controller.pane.style.zIndex = z
				controller.pane.style.transitionDuration = '0s'
				controller.pane.style.transform = 'translate(' + x + ', ' + y + ')'
				controller.pane.style.visibility = null
				this._currentName = name
				requestAnimationFrame(function () {
					controller.pane.style.transitionDuration = null
					controller.pane.style.transform = 'translate(0, 0)'
				})
			},
			slideOut: function (to) {
				var controller = this.currentChild
				var x, y
				if (to === 'right') {
					x = '100%'
					y = '0%'
				} else if (to === 'left') {
					x = '-' + this.translateOut + '%'
					y = '0%'
				} else if (to === 'bottom') {
					x = '0%'
					y = '100%'
				} else if (to === 'top') {
					x = '0%'
					y = '-' + this.translateOut + '%'
				}
				controller.pane.style.transform = 'translate(' + x + ', ' + y + ')'
			}
		})

		return BrowseController
	})()

	var Bones = {
		/**
		 * Builds a controller tree.
		 *
		 * descriptor		a hash containing the definition for the controller, or a controller instance created previously
		 *
		 * Properties (all are optional):
		 * pane				the DOM node for this controller
		 * children			descriptors for child controllers
		 * on				declares event listeners for framework events
		 * observe			declares event listeners for DOM events
		 * functions		defines functions to be attached to the controller
		 */
		build: function (descriptor) {
			if (Object.getPrototypeOf(descriptor) !== Object.prototype) {
				// Assume this is a controller instance.
				return descriptor
			}
			// Use the pane on the descriptor or create one.
			var pane = descriptor.pane || this.createPane()
			// Use the constructor specified by the descriptor, or use the constructor based on whether and how children are defined.
			var constructor = descriptor.hasOwnProperty('constructor') ? descriptor.constructor :
				!descriptor.children ? Controller :
				Array.isArray(descriptor.children) ? StackController :
				BrowseController
			var controller = new constructor(pane, descriptor)

			if (descriptor.children) {
				if (Array.isArray(descriptor.children)) {
					descriptor.children.forEach(function (descriptor) {
						controller.append(Bones.build(descriptor))
					})
				} else {
					Object.keys(descriptor.children).forEach(function (name) {
						controller.add(Bones.build(descriptor.children[name]), name)
					})
				}
			}

			if (descriptor.on) {
				Object.keys(descriptor.on).forEach(function (type) {
					controller.on(type, descriptor.on[type])
				})
			}

			if (descriptor.functions) {
				Object.keys(descriptor.functions).forEach(function (name) {
					controller[name] = descriptor.functions[name]
				})
			}

			// Override render to add event hooks.
			controller.render = (function (render) {
				return function () {
					// The render event can be cancelled.
					if (this.trigger('beforerender')) {
						render.call(controller)
						this.trigger('afterrender')
					}
				}
			})(controller.render)

			if (descriptor.observe) {
				var observe = Object.keys(descriptor.observe).map(function (event) {
					var space = (event + ' ').indexOf(' ')
					var selector = event.substring(space + 1).trim()
					var type = event.substring(0, space)
					var handler = descriptor.observe[event]
					var listener = typeof handler === 'string' ? controller[handler].bind(controller) :
						typeof handler === 'function' ? handler.bind(controller) :
						handler
					return {event: event, type: type, selector: selector, listener: listener}
				})

				// After rendering or removal, remove event listeners.
				controller.on('afterrender remove', function () {
					observe.forEach(function (info) {
						if (info.nodes) {
							info.nodes.forEach(function (node) {
								node.removeEventListener(info.type, info.listener)
							})
							delete info.nodes
						}
					})
				})
				// After rendering (and after the above listener), add event listeners.
				controller.on('afterrender', function () {
					observe.forEach(function (info) {
						info.nodes = info.selector ? Array.prototype.slice.call(this.pane.querySelectorAll(info.selector)) : [this.pane]
						info.nodes.forEach(function (node) {
							node.addEventListener(info.type, info.listener)
						})
					}, this)
				})
			}
			// If the pane is inserted or removed from the DOM, trigger corresponding framework events.
			// These events trickle down to all descendants.
			pane.addEventListener('bones:insert', function () {
				controller.trigger('insert', {trickles: true, bubbles: false, cancelable: false})
			})
			pane.addEventListener('bones:remove', function () {
				controller.trigger('remove', {trickles: true, bubbles: false, cancelable: false})
			})

			return controller
		},

		/**
		 * Creates a DOM node for a new pane.
		 */
		createPane: function () {
			var pane = document.createElement('div')
			pane.classList.add('pane')
			return pane
		},

		/**
		 * Returns whether the given node is a pane node.
		 */
		isPane: function (node) {
			return node.classList.contains('pane')
		},

		/**
		 * Selects all pane nodes that are a descendant of the given node.
		 */
		selectPanes: function (node) {
			return node.getElementsByClassName('pane')
		},

		/**
		 * The number of pixels a swipe has to cover before it is interpreted as a page transition.
		 */
		threshold: 80,
		/**
		 * The percentage the current pane is translated when the next pane slides in.
		 * At 100%, the current pane is pushed by the next pane. At lower percentages, the next pane slides over
		 * the current pane.
		 */
		translateOut: 25,
		/**
		 * The constant that sets the strength of the spring that pulls the first or last pane back when swiped.
		 * This only has effect if the overflow property of the controller is set to 'spring'.
		 */
		springConstant: 0.25,

		enableSwiping: function (controller) {
			var pane = controller.pane
			var horizontal = controller.orientation === 'horizontal'
			var transform = horizontal ? 'translateX' : 'translateY'
			var x1, y1, x2, y2
			var allowed = undefined // Is handling the current gesture allowed?
			var capture = undefined // Is this controller handling the current gesture?

			function resetState() {
				arrange(controller)
				x1 = x2 = y1 = y2 = undefined
				allowed = capture = undefined
			}

			pane.addEventListener('touchstart', function (e) {
				if (e.touches.length > 1) {
					controller.trigger('swipecancel', {cancelable: false})
					resetState()
				} else {
					if (allowed === undefined) {
						allowed = controller.trigger('swipestart')
					}
					if (allowed) {
						x1 = e.pageX
						y1 = e.pageY
						controller.currentChild.pane.style.transitionDuration = '0s'
						if (controller.hasNext) {
							controller.nextChild.pane.style.transitionDuration = '0s'
						}
						if (controller.hasPrevious) {
							controller.previousChild.pane.style.transitionDuration = '0s'
						}
					}
				}
			})
			pane.addEventListener('touchmove', function (e) {
				if (allowed) {
					x2 = e.pageX
					y2 = e.pageY
					var dx = x2 - x1
					var dy = y2 - y1
					var distance, translation, currentPane, relatedPane
					if (capture === undefined) {
						if (horizontal) {
							capture = Math.abs(dx) > Math.abs(dy)
						} else {
							capture = Math.abs(dy) > Math.abs(dx)
						}
						if (!capture) {
							// The user swipes in the direction that is not supported. Trigger the swipecancel event.
							controller.trigger('swipecancel', {cancelable: false})
						}
					}
					if (capture) {
						distance = horizontal ? dx : dy
						if (distance > 0 && !controller.hasPrevious || distance < 0 && !controller.hasNext) {
							// Swiping past the first or last child.
							if (controller.overflow === 'propagate') {
								// Let the parent handle the swipe if it can.
								capture = false
							} else if (controller.overflow === 'spring') {
								// Introduce spring-like behaviour.
								distance /= Math.sqrt(Math.abs(distance)) * Bones.springConstant
							} else if (controller.overflow === 'none') {
								distance = 0
							}
						}
						if (capture) {
							e.preventDefault()
							e.stopPropagation()
							currentPane = controller.currentChild.pane
							translation = 100 * distance / (horizontal ? currentPane.offsetWidth : currentPane.offsetHeight)
							if (distance >= 0) {
								currentPane.style.transform = transform + '(' + translation + '%)'
								if (controller.hasPrevious) {
									controller.previousChild.pane.style.transform = transform + '(' + ((translation - 100) * controller.translateOut / 100) + '%)'
								}
							} else {
								// Note: translation is negative.
								if (controller.hasNext) {
									currentPane.style.transform = transform + '(' + (translation * controller.translateOut / 100) + '%)'
									controller.nextChild.pane.style.transform = transform + '(' + (translation + 100) + '%)'
								} else {
									currentPane.style.transform = transform + '(' + translation + '%)'
								}
							}
							controller.trigger('swipemove', {cancelable: false, detail: {distance: distance}})
						}
					}
				}
			})
			pane.addEventListener('touchend', function (e) {
				if (allowed) {
					controller.currentChild.pane.style.transitionDuration = null
					if (controller.hasNext) {
						controller.nextChild.pane.style.transitionDuration = null
					}
					if (controller.hasPrevious) {
						controller.previousChild.pane.style.transitionDuration = null
					}
					if (capture) {
						var distance = horizontal ? x2 - x1 : y2 - y1
						if (Math.abs(distance) > controller.threshold) {
							if (distance < 0 && controller.hasNext) {
								controller.trigger('swipeend', {cancelable: false, detail: {distance: distance}})
								controller.next()
							} else if (distance > 0 && controller.hasPrevious) {
								controller.trigger('swipeend', {cancelable: false, detail: {distance: distance}})
								controller.previous()
							} else {
								controller.trigger('swipecancel', {cancelable: false})
							}
						} else {
							controller.trigger('swipecancel', {cancelable: false})
						}
					}
				}
				resetState()
			})
		},

		Controller: Controller,
		StackController: StackController,
		BrowseController: BrowseController
	}

	return Bones
})