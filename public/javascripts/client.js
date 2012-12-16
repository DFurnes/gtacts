$(document).ready(function() {
	// some placeholder data to play around with
	var contacts = [
		{ name: "John Barrowman", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
		{ name: "Karen Gillan", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
		{ name: "Arthur Darvill", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
		{ name: "Catherine Tate", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
		{ name: "Billie Piper", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
		{ name: "Matt Smith", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
		{ name: "David Tennant", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" },
		{ name: "Christopher Eccleston", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"gplus" },
		{ name: "William Hartnell", address: "1, street, town, city, 12345", tel: "0123456789", email:"example@example.com", type:"google" }
	];

	// define contact model
	var Contact = Backbone.Model.extend({
		defaults: {
			photo: "./images/person.png"
		}
	});

	// define the directory collection
	var Directory = Backbone.Collection.extend({
		model: Contact
	});

	// define the individual contact view
	var ContactView = Backbone.View.extend({
		tagName: "article",
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
			this.collection = new Directory(contacts);
			this.render();
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

	// create an instance of the master view
	var directory = new DirectoryView();
});