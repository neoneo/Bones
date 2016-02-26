(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory);
	} else {
		root.Bones = factory();
	}
})(this, function () {
	'use strict'

	// Observe insertion and removal of panes and dispatch a custom event so that controllers can listen to
	// that event on their pane elements.
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
	 * This controller only implements framework event handling.
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
			/**
			 * Adds an event listener for the event of the given type(s).
			 * The type argument can be a space delimited list of event types.
			 */
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
			/**
			 * Removes an event listener for the event of the given type(s).
			 * The type argument can be a space delimited list of event types.
			 */
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
			/**
			 * Triggers the event of the given type on the controller.
			 * Returns true if `preventDefault()` was not called on the event.
			 */
			trigger: function (type, options) {
				var event = new Event(type, this, options)
				handleEvent(this, event)
				return !event.defaultPrevented
			},
			/**
			 * Generates the contents of the pane and inserts it into the pane element.
			 */
			render: function () {}
		}

		/**
		 * Event constructor
		 * type			the event type
		 * controller	the event target
		 * options		hash that sets properties of the event
		 *
		 * The event mechanism supports two types of propagation:
		 * - bubbling: the event bubbles up to ancestor controllers, analogous to DOM events
		 * - trickling: the event trickles down to all descendant controllers.
		 * If enabled, event propagation starts with the trickling phase, followed by the bubbling phase.
		 * During the trickling phase, calls to `stopPropagation` and `preventDefault` have no effect.
		 *
		 * The options has may contain the following keys:
		 * - bubbles: boolean, whether the event bubbles (default: true).
		 * - trickles: boolean, whether the event trickles (default: false).
		 * - cancelable: boolean, whether the default can be prevented (default: true).
		 */
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
			/**
			 * Stops event propagation to the parent. All remaining listeners for this event on the current controller
			 * will still be called.
			 */
			stopPropagation: function () {
				if (this._phase > Event.TRICKLING_PHASE) {
					this._propagationStopped = true
				}
			},
			/**
			 * Prevents the default action belonging to this event.
			 * In essence, this only sets the return value of the call to `trigger`.
			 */
			preventDefault: function () {
				if (this._phase > Event.TRICKLING_PHASE && this._cancelable) {
					this._defaultPrevented = true
				}
			},
			get defaultPrevented() {
				return this._defaultPrevented
			}
		}
		/**
		 * Calls the event handlers attached to the controller, and traverses the controller tree
		 * for the different phases of event propagation.
		 */
		function handleEvent(controller, event) {
			if (event._phase <= Event.TRICKLING_PHASE) {
				if (event._trickles) {
					event._phase = Event.TRICKLING_PHASE
					var children = controller.children
					if (children && children.length) {
						children.forEach(function (child) {
							// Let the child handle the event. So this is a depth-first traversal.
							handleEvent(child, event)
						})
					}
				}
				if (controller === event.controller) {
					event._phase = Event.AT_TARGET
				}
			}
			// Call the listeners:
			var listeners = controller._listeners[event.type]
			if (listeners && listeners.length) {
				listeners.forEach(function (listener) {
					listener.call(controller, event)
				})
			}
			// If the phase is AT_TARGET or BUBBLING_PHASE, we can move up to the parent.
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
		/**
		 * Enables swiping between children for the controller.
		 */
		function enableSwiping(controller) {
			var pane = controller.pane
			var horizontal = controller.orientation === 'horizontal'
			var transform = horizontal ? 'translateX' : 'translateY'
			var x1, y1, x2, y2
			var capture = undefined // Is this controller handling the current gesture?

			function resetState() {
				arrange(controller)
				x1 = x2 = y1 = y2 = undefined
				capture = undefined
			}

			pane.addEventListener('touchstart', function (e) {
				if (e.touches.length > 1) {
					if (capture) {
						controller.trigger('swipecancel', {cancelable: false})
					}
					resetState()
				} else {
					x1 = e.touches[0].pageX
					y1 = e.touches[0].pageY
				}
			})

			pane.addEventListener('touchcancel', function (e) {
				if (capture) {
					controller.trigger('swipecancel', {cancelable: false})
				}
				resetState()
			})

			pane.addEventListener('touchmove', function (e) {
				x2 = e.touches[0].pageX
				y2 = e.touches[0].pageY
				var dx = x2 - x1
				var dy = y2 - y1
				var distance, translation, currentPane, relatedPane
				if (capture === undefined) {
					// Capture the gesture if the swipe is in the general direction expected.
					if (horizontal) {
						capture = Math.abs(dx) > Math.abs(dy)
					} else {
						capture = Math.abs(dy) > Math.abs(dx)
					}
					if (capture) {
						// Capture was just set to true, so only now trigger the swipestart event.
						controller.trigger('swipestart', {cancelable: false, detail: {x: x1, y: y1}})
						controller.currentChild.pane.style.transitionDuration = '0s'
						if (controller.hasNext) {
							controller.nextChild.pane.style.transitionDuration = '0s'
						}
						if (controller.hasPrevious) {
							controller.previousChild.pane.style.transitionDuration = '0s'
						}
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
					// If capture is still on, position the affected panes.
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
			})

			pane.addEventListener('touchend', function (e) {
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
							// Distance is 0, or there was no next/previous child. Undo whatever movement was made.
							controller.trigger('swipecancel', {cancelable: false})
						}
					} else {
						// Not enough distance covered.
						controller.trigger('swipecancel', {cancelable: false})
					}
				}
				resetState()
			})
		}

		/**
		 * Lets the next or previous pane of the controller slide in, and lets the current pane slide out.
		 * Returns a promise that is resolved when the slide is complete.
		 */
		function slide(controller, next) {
			return new Promise(function (resolve) {
				var transform = controller.orientation === 'horizontal' ? 'translateX' : 'translateY'

				// The state of the controller has already changed. The current child is the one that is going to slide in.
				var slidingIn = controller.currentChild
				var slidingOut // The child that was active previously, but now is going to slide out.
				slidingIn.pane.style.transform = transform + '(0)'

				// If we moved to the next child, then the controller should have a previous child, and the other way around.
				if (next) {
					slidingOut = controller.previousChild
					// Slide to the left or top.
					slidingOut.pane.style.transform = transform + '(-' + controller.translateOut + '%)'
				} else {
					slidingOut = controller.nextChild
					// Slide to the right or bottom.
					slidingOut.pane.style.transform = transform + '(100%)'
				}

				// Trigger events:
				// 1. Trigger the `beforeslide` event on the controller:
				controller.trigger('beforeslide', {detail: {next: next}, cancelable: false, bubbles: false, trickles: false})

				// 2. Trigger the `beforeslideout` event on the child sliding out:
				slidingOut.trigger('beforeslideout', {cancelable: false, bubbles: true, trickles: true})

				// 3. Trigger the `beforeslidein` event on the child sliding in:
				slidingIn.trigger('beforeslidein', {cancelable: false, bubbles: true, trickles: true})

				slidingOut.pane.addEventListener('transitionend', function translateOut(e) {
					if (e.propertyName === 'transform') {
						// 4a. Trigger the `afterslideout` event.
						slidingOut.trigger('afterslideout', {cancelable: false, bubbles: true, trickles: true})
						e.target.removeEventListener('transitionend', translateOut)
					}
				})

				slidingIn.pane.addEventListener('transitionend', function translateIn(e) {
					if (e.propertyName === 'transform') {
						// 4b. Trigger the `afterslidein` event.
						slidingIn.trigger('afterslidein', {cancelable: false, bubbles: true, trickles: true})

						// 4c. Finally, when the current child's animation is complete, notify the (parent) controller.
						controller.trigger('afterslide', {detail: {next: next}, cancelable: false, bubbles: false, trickles: false})
						e.target.removeEventListener('transitionend', translateIn)
						resolve()
					}
				})
			})
		}

		/**
		 * (Re-)positions the children of the controller.
		 */
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

		/**
		 * StackController constructor
		 * Properties:
		 * - swipe: boolean, if true, enables swiping between children
		 * - overflow: string, defines what happens if the user swipes past the first or last child.
		 * - translateOut: number, defines the number of pixels a child pane slides out (default: Bones.translateOut).
		 * - threshold: number, defines the number of pixels the user must swipe before a slide is triggered (default: Bones.threshold).
		 *
		 * The overflow property can be one of the following: `spring`, `propagate`, or `none`.
		 * - `spring`: mimicks a spring attached to the pane, so that it lags behind the swipe gesture
		 * - `propagate`: lets the parent handle the swipe gesture
		 * - `none`: ignores the swipe gesture
		 */
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
				enableSwiping(this)
			}
		}
		StackController.prototype = Object.create(Controller.prototype)
		StackController.prototype.constructor = StackController

		/**
		 * Defines the properties on the given prototype.
		 */
		function extend(prototype, properties) {
			Object.keys(properties).forEach(function (name) {
				Object.defineProperty(prototype, name, Object.getOwnPropertyDescriptor(properties, name))
			})
		}

		extend(StackController.prototype, {
			/**
			 * Returns the children collection.
			 */
			get children() {
				return this._children
			},
			get count() {
				return this.children.length
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
			/**
			 * Appends the controller to the end of the stack.
			 */
			append: function (controller) {
				controller.parent = this
				this.pane.appendChild(controller.pane)
				this._children.push(controller)
				arrange(this)
			},
			/**
			 * Prepends the controller to the stack.
			 */
			prepend: function (controller) {
				if (!this.children.length) {
					this.append(controller)
				} else {
					controller.parent = this
					this.pane.insertBefore(controller.pane, this.children[0].pane)
					this._children.unshift(controller)
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
			/**
			 * Moves to the next child.
			 * Returns a promise that is fulfilled after the sliding animation is complete.
			 */
			next: function () {
				if (this.hasNext && this.trigger('next')) {
					this._currentIndex += 1
					return slide(this, true)
				}
				return Promise.reject()
			},
			get hasNext() {
				return this._currentIndex < this.children.length - 1
			},
			/**
			 * Moves to the previous child.
			 * Returns a promise that is fulfilled after the sliding animation is complete.
			 */
			previous: function () {
				if (this.hasPrevious && this.trigger('previous')) {
					this._currentIndex -= 1
					return slide(this, false)
				}
				return Promise.reject()
			},
			get hasPrevious() {
				return this._currentIndex > 0
			},
			/**
			 * Navigates to the first child and returns a promise that is fulfilled when that child has finished sliding in.
			 * Intermediate children are sliding in and out as well, so all events are fired for those children.
			 */
			first: function () {
				var promise
				if (this.hasPrevious) {
					do {
						promise = this.previous()
					} while (this.hasPrevious)
					return promise
				} else {
					return Promise.resolved()
				}
			},
			/**
			 * Navigates to the last child and returns a promise that is fulfilled when that child has finished sliding in.
			 * Intermediate children are sliding in and out as well, so all events are fired for those children.
			 */
			last: function () {
				var promise
				if (this.hasNext) {
					do {
						promise = this.next()
					} while (this.hasNext)
					return promise
				} else {
					return Promise.resolved()
				}
			},
			render: function () {
				this.children.forEach(function (child) {
					child.render()
				})
			}
		})

		return StackController
	})()

	// BONES OBJECT

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

		Controller: Controller,
		StackController: StackController
	}

	return Bones
})