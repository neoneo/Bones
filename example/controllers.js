function extend(prototype, properties) {
	Object.keys(properties).forEach(function (name) {
		Object.defineProperty(prototype, name, Object.getOwnPropertyDescriptor(properties, name))
	})
}

/**
 * TemplateController
 * This controller is an example extension of Bones.Controller for rendering templates using a template engine.
 * The render function must be implemented to call the template engine of choice. This can be achieved by simply
 * adding the function to the prototype.
 */
function TemplateController(pane, properties) {
	Bones.Controller.call(this, pane, properties)
	// We expect template and data properties, where data is used to render the template.
	this._template = properties.template;
	this._data = properties.data;
}
TemplateController.prototype = Object.create(Bones.Controller.prototype)
TemplateController.prototype.constructor = TemplateController
extend(TemplateController.prototype, {
	render: function () {
		throw 'Not implemented'
	},
	get template() {
		return this._template
	},
	get data() {
		return this._data
	}
})

/**
 * ContainerController
 * This controller places the content of its children inside a given element, identified by a css selector.
 * This is a decorator around a Bones.CompositeController. This controller can only be created when the template has been
 * rendered, in order for the css selector to return a container element, so many functions of ContainerController will
 * return undefined or throw exceptions when called before render.
 */
function ContainerController(pane, properties) {
	TemplateController.call(this, pane, properties)

	this._containerSelector = properties.container
	this._properties = properties

	// Render the containing template already, assuming it doesn't need additional data.
	// For several reasons, this should be implemented differently but for this example it has to suffice.
	TemplateController.prototype.render.call(this)
	var pane = this.pane.querySelector(this._containerSelector)
	this._subcontroller = new Bones.CompositeController(pane, this._properties)
	// Let framework events be triggered on the wrapper, not on the subcontroller.
	this._subcontroller.trigger = this.trigger.bind(this)
}
ContainerController.prototype = Object.create(TemplateController.prototype)
ContainerController.prototype.constructor = ContainerController
ContainerController.prototype.render = function () {
	this._subcontroller.render()
}
// Add the Bones.CompositeController prototype and map calls over to the subcontroller.
Object.keys(Bones.CompositeController.prototype).forEach(function (name) {
	if (name !== 'constructor' && name !== 'render') {
		var property = Object.getOwnPropertyDescriptor(Bones.CompositeController.prototype, name)
		if (property.hasOwnProperty('value')) {
			if (typeof property.value === 'function') {
				property.value = (function (wrapped) {
					return function () {
						return wrapped.apply(this._subcontroller, arguments)
					}
				})(property.value)
			}
		} else {
			if (property.get) {
				property.get = (function (wrapped) {
					return function () {
						return wrapped.call(this._subcontroller)
					}
				})(property.get)
			}
			if (property.set) {
				property.set = (function (wrapped) {
					return function (value) {
						return wrapped.call(this._subcontroller, value)
					}
				})(property.set)
			}
		}
		Object.defineProperty(ContainerController.prototype, name, property)
	}
})