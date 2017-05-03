Bones
=====

Bones is a Javascript library for easy page transitions in single page apps.

Each page in a Bones app is represented by a controller, which listens and
responds to events. The controller has a handle to the DOM node (the pane) that
contains the page.

Controllers are mainly created using the `Bones.build(<descriptor>)` function.
The descriptor is a hash that describes the controller: does it have children,
is swiping enabled between children, which events are bound, and so on.

The included example app should give a good idea of how that works. It
also includes some extensions which might prove useful, at least as a
starting point.

Bones comes with two controller types: `Bones.LeafController` and
`Bones.CompositeController`. `Bones.CompositeController`'s sole purpose is
to be able to build a tree of controllers. The leaves of the tree are the
interesting parts of your app (the parts that actually display something), and
are represented by `Bones.LeafController` instances.

Descriptors
-----------

A descriptor is a hash that may contain some properties. All properties are
optional, some have default values as indicated.

property        | description
----------------|--------------------------------------------------------------------------------
constructor 	| the controller constructor (`Bones.LeafController` or `Bones.CompositeController`)
pane			| the DOM node of the pane (`Bones.createPane()`)
children		| an array of child descriptors
on				| declares event listeners for framework events
observe			| declares event listeners for DOM events
extend			| defines additional properties for the controller

The `on` and `observe` properties declare event listeners for Bones and DOM
events respectively. These properties are hashes where each
key defines the event to listen to, and its value is the event listener.
In the case of Bones events, the event key can be a space delimited list of
events. For DOM events, the event key contains the name of the DOM event followed
by a CSS selector, which selects the element within the pane to add the event
listener to.

Both framework and DOM event listeners are bound to the applicable controller (`this`).

Framework events
----------------

The framework event cycle is similar to the DOM event cycle, except that the target is
always a controller. Event propagation occurs within the controller tree.

Two types of propagation are supported:

- bubbling: the event bubbles up to ancestor controllers, analogous to DOM events
- trickling: the event trickles down to all descendant controllers.

If enabled, event propagation starts with the trickling phase, followed by the bubbling phase.
During the trickling phase, calls to `stopPropagation` and `preventDefault` have no effect.

Any event can be registered, unregistered and triggered programmatically, using
`controller.on(<type>, <listener>)`, `controller.off(<type>, <listener>)` and
`controller.trigger(<type>, <options>, <detail>)`, respectively.

The options hash may contain the following keys:

- bubbles: boolean, whether the event bubbles (default: true).
- trickles: boolean, whether the event trickles (default: false).
- cancelable: boolean, whether the default can be prevented (default: true).

The following framework events are available by default:

event			| description
----------------|----------------------------------------------------------------------------
beforerender	| the pane is about to be rendered
afterrender		| the pane has finished rendering
insert			| the pane's DOM node has been inserted in the DOM
remove			| the pane's DOM node has been removed from the DOM

For `Bones.CompositeController`s, the following events are available:

event			| description
----------------|----------------------------------------------------------------------------
swipestart		| the user starts swiping in the enabled direction
swipemove		| the user has started swiping, and moves
swipeend		| the user ends swiping, and has covered enough distance to trigger a slide
swipecancel		| not enough distance covered, multiple touches
beforeslide		| a child pane is going to slide out
afterslide		| the child pane has finished sliding out
beforeslideout	| the pane is going to slide out
afterslideout	| the pane has finished sliding out
beforeslidein	| the pane is going to slide in
afterslidein	| the pane has finished sliding in
next			| the user wants to go to the next pane
previous		| the user wants to go to the previous pane