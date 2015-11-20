Bones = (function () {
	return {
		build: function (descriptor) {
			var pane = this.createPane()
			var constructor = Bones.Controller
			var controller = new constructor(pane)

			if (descriptor.attributes) {
				if (descriptor.attributes.orientation) {
					controller.orientation = descriptor.attributes.orientation
				}

				if (descriptor.attributes.swipe) {
					controller.swipe = descriptor.attributes.swipe
				}
				if (descriptor.attributes.children) {
					descriptor.attributes.children.forEach(function (descriptor) {
						controller.add(Bones.build(descriptor))
					})
				}
			}

			for (var property in descriptor) {
				if (descriptor.hasOwnProperty(property) && property !== 'attributes') {
					controller[property] = descriptor[property]
				}
			}

			return controller
		},

		createPane: function () {
			var pane = document.createElement('div')
			pane.classList.add('pane')
			return pane
		},

		Controller: (function () {

			function slide(controller) {
				if (controller.orientation === 'horizontal') {
					controller.pane.style.transform = 'translate3d(-' + (controller._current * 100) + '%, 0)'
				} else {
					controller.pane.style.transform = 'translate(0, -' + (controller._current * 100) + '%)'
				}
			}

			function arrange(controller) {
				var horizontal = controller.orientation === 'horizontal'
				var start = -controller._current * 100
				console.log(controller)
				controller.children.forEach(function (child, index) {
					child.pane.style[horizontal ? 'left' : 'top'] = '' + (start + index * 100) + '%'
				})
			}

			function enableSwipe(controller) {
				var pane = controller.pane
				var horizontal = controller.orientation === 'horizontal'
				var pos1, pos2

				pane.addEventListener('touchstart', function (e) {
					if (e.touches.length > 1) {
						pos1 = undefined
					} else {
						pos1 = horizontal ? e.pageX : e.pageY
					}
				})
				pane.addEventListener('touchmove', function (e) {
					if (e.touches.length === 1) {
						e.preventDefault()
					}
				})
				pane.addEventListener('touchend', function (e) {
					if (typeof pos1 !== 'undefined' && !e.defaultPrevented) {
						pos2 = horizontal ? e.pageX : e.pageY

						if (Math.abs(pos1 - pos2) > 30) {
							if (pos1 > pos2) {
								if (!controller.trigger('next').isCancelled()) {
									controller.next()
								}
							} else {
								if (!controller.trigger('previous').isCancelled()) {
									controller.previous()
								}
							}
							// Let the event bubble up so the parent can reset its state.
							e.preventDefault();
						}
					}
					pos1 = undefined
					pos2 = undefined
				})
			}

			var Controller = function (pane) {
				this._pane = pane
				this._parent = null
				this._children = []
				this._swipe = false
				this._orientation = 'horizontal'
				this._current = 0
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
				get children() {
					return this._children
				},
				get swipe() {
					return this._swipe
				},
				set swipe(value) {
					this._swipe = !!value
					if (this._swipe) {
						enableSwipe(this)
					}
				},
				get orientation() {
					return this._orientation
				},
				set orientation(value) {
					this._orientation = value
					arrange(this)
				},
				isRendered: function () {
					return $.contains(document, this.pane)
				},
				add: function (child) {
					this._children.push(child)
					child.parent = this
					arrange(this)
				},
				remove: function (child) {
					var index = this._children.indexOf(child)
					if (index > -1) {
						this._children.splice(index, 1)
						arrange(this)
					}
				},
				render: function () {
					var pane = this.pane
					this.children.forEach(function (child) {
						child.render()
						pane.appendChild(child.pane)
					})
				},
				next: function () {
					if (this._current < this.children.length - 1) {
						this._current += 1
						slide(this)
					}
				},
				previous: function () {
					if (this._current > 0) {
						this._current -= 1
						slide(this)
					}
				},
				first: function () {
					this._current = 0
					slide(this)
				},
				last: function () {
					this._current = Math.max(this.children.length - 1, 0)
					slide(this)
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
					})
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
					})
				},
				trigger: function (type, data) {
					var event = new Event(type, this, data)
					this._handleEvent(event)
					return event
				},
				_handleEvent: function (event) {
					var listeners = this._listeners[event.type]
					if (listeners && listeners.length) {
						listeners.forEach(function () {
							listener(event)
						})
						if (!event.isCancelled() && this.parent) {
							this.parent._handleEvent(event)
						}
					}
				}
			}

			var Event = function (type, controller, data) {
				this._type = type
				this._controller = controller
				this._data = data
				this._cancelled = false
			}
			Event.prototype = {
				get type() {
					return this._type
				},
				get controller() {
					return this._controller
				},
				get data() {
					return this._data
				},
				cancel: function () {
					this._cancelled = true
				},
				isCancelled: function () {
					return this._cancelled
				}
			}

			return Controller
		})()

	}
})()