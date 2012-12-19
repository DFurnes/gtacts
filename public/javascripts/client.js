$(function() {
	// some placeholder data to play around with
	// set underscore.js to parse {{ }} instead of <%= %>
	_.templateSettings = {
    interpolate: /\{\{(.+?)\}\}/g
	};

	// define contact model
	var Contact = Backbone.Model.extend({
		idAttribute: "profile_id",
		defaults: {
			photo: "./images/person.png"
		},
		select: function() {
			this.set({selected: true});
			this.collection.selectContact(this);
		}
	});

	// define the directory collection
	var Directory = Backbone.Collection.extend({
		model: Contact,
		url: './api/contacts',
		selectContact: function(contact) {
			this.event.trigger("contact:selected", contact);
		}
	});

	// define the individual contact view
	var ContactView = Backbone.View.extend({
		tagName: "li",
		className: "contact-container",
		template: $("#contactTemplate").html(),
		render: function() {
			var tmpl = _.template(this.template);
			this.$el.html(tmpl(this.model.toJSON()));
			return this;
		}
	});

	// define the master view
	var DirectoryView = Backbone.View.extend({
		el: $("#contacts"),
		initialize: function() {
			console.log("initializing!");
			var that = this;
			this.collection = new Directory();
			this.collection.fetch({success: function() {
				console.log("fetched!");
				that.render();
			}});
			
		},
		render: function() {
			var that = this;
			_.each(this.collection.models, function(item) {
				that.renderContact(item);
			}, this);
		},
		renderContact: function(item) {
			var contactView = new ContactView({
				model: item
			});
			this.$el.append(contactView.render().el);
		}
	});

	// var ContactRouter = Backbone.Router.extend({
	// 	routes: {
	// 		"/:id": "showContact"
	// 	},
	// 	initialize: function(options) {
	// 		this.controller = options.controller;
	// 	},
	// 	showContact: function(id) {
	// 		var contact = this.contacts.get(id);
	// 		contact.select();
	// 	}
	// });

	// create an instance of the master view
	var directory = new DirectoryView();
	// var router = new ContactRouter({controller: directory});



	// var contacts = [
	// 	{ name: "John Barrowman", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
	// 	{ name: "Karen Gillan", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
	// 	{ name: "Arthur Darvill", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
	// 	{ name: "Catherine Tate", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
	// 	{ name: "Billie Piper", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
	// 	{ name: "Matt Smith", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
	// 	{ name: "David Tennant", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
	// 	{ name: "Christopher Eccleston", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
	// 	{ name: "William Hartnell", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" }
	// ];

});