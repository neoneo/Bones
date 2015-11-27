Bones = (function () {
	return {
		build: function (descriptor) {
			var pane = this.createPane()
			var constructor = Bones.Controller
			var controller = new constructor(pane)

			if (descriptor.properties) {
				if (descriptor.properties.orientation) {
					controller.orientation = descriptor.properties.orientation
				}

				if (descriptor.properties.swipe) {
					controller.swipe = descriptor.properties.swipe
				}
				if (descriptor.properties.children) {
					descriptor.properties.children.forEach(function (descriptor) {
						controller.add(Bones.build(descriptor))
					})
				}
			}

			for (var property in descriptor) {
				if (descriptor.hasOwnProperty(property) && property !== 'properties') {
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

		threshold: 80,

		Controller: (function () {

			function slide(controller) {
				if (controller.orientation === 'horizontal') {
					controller.pane.style.transform = 'translate(-' + (controller._current * 100) + '%, 0)'
				} else {
					controller.pane.style.transform = 'translate(0, -' + (controller._current * 100) + '%)'
				}
			}

			function arrange(controller) {
				var horizontal = controller.orientation === 'horizontal'
				controller.children.forEach(function (child, index) {
					child.pane.style[horizontal ? 'left' : 'top'] = '' + (index * 100) + '%'
				})
			}

			function enableSwiping(controller) {
				var pane = controller.pane
				var horizontal = controller.orientation === 'horizontal'
				var x1, y1, x2, y2
				var allowed = undefined // Is handling the current gesture allowed?
				var capture = undefined // Is this controller handling the current gesture?

				function resetState() {
					arrange(controller)
					pos1 = undefined
					pos2 = undefined
					allowed = undefined
					capture = undefined
				}

				pane.addEventListener('touchstart', function (e) {
					if (e.touches.length > 1) {
						resetState()
					} else {
						if (allowed === undefined) {
							allowed = controller.trigger('browse').isCancelled() ? false : true
						}
						if (allowed) {
							x1 = e.pageX
							y1 = e.pageY
							pane.style.transitionDuration = '0s'
						}
					}
				})
				pane.addEventListener('touchmove', function (e) {
					if (allowed) {
						x2 = e.pageX
						y2 = e.pageY
						if (capture === undefined) {
							if (horizontal) {
								capture = Math.abs(x1 - x2) > Math.abs(y1 - y2) ? true : false
							} else {
								capture = Math.abs(y1 - y2) > Math.abs(x1 - x2) ? true : false
							}
						}
						if (capture) {
							e.preventDefault()
							e.stopPropagation()
							if (horizontal) {
								pane.style.transform = 'translate(' + (((x2 - x1) / pane.offsetWidth - controller._current) * 100) + '%, 0)'
							} else {
								pane.style.transform = 'translate(0, ' + (((y2 - y1) / pane.offsetHeight - controller._current) * 100) + '%)'
							}
						}
					}
				})
				pane.addEventListener('touchend', function (e) {
					if (capture) {
						pane.style.transitionDuration = null
						var pos1, pos2
						if (horizontal) {
							pos1 = x1
							pos2 = x2
						} else {
							pos1 = y1
							pos2 = y2
						}
						if (Math.abs(pos1 - pos2) > Bones.threshold) {
							if (pos1 > pos2 && controller.hasNext() && !controller.trigger('next').isCancelled()) {
								controller.next()
							} else if (pos1 < pos2 && controller.hasPrevious() && !controller.trigger('previous').isCancelled()) {
								controller.previous()
							} else {
								slide(controller)
							}
						} else {
							slide(controller)
						}
					}
					resetState()
				})
			}

			var Controller = function (pane, properties) {
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
						enableSwiping(this)
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
					if (this.hasNext()) {
						this._current += 1
						slide(this)
					}
				},
				hasNext: function () {
					return this._current < this.children.length - 1
				},
				previous: function () {
					if (this.hasPrevious()) {
						this._current -= 1
						slide(this)
					}
				},
				hasPrevious: function () {
					return this._current > 0
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